# LaunchWings — System Architecture (v0)

This is the build-target architecture. Sized for 0 → 50k users on a single founding team.

## Guiding constraints

- **2-engineer team for first 12 months.** Boring, mainstream stack. No bespoke databases.
- **Agents must be observable and resumable.** A launch is multi-day; runs cannot be lost on deploy.
- **AI cost is the largest variable cost.** Aggressive caching, model routing, BYOK escape valve.
- **Multi-tenant from day 1.** Per-tenant data isolation; secrets per tenant.
- **Fail open on agent errors, fail closed on user data.** A failed Reddit post is not a P0; a leaked API key is.

## High-level diagram

```
┌────────────────────────────────────────────────────────────────────┐
│                          Web (Next.js 15)                           │
│   marketing site · app dashboard · approval inbox · live launch    │
└────────────────────────┬─────────────────────────┬────────────────┘
                         │                         │
                  REST / tRPC                  Server-Sent Events
                         │                         │
┌────────────────────────▼─────────────────────────▼────────────────┐
│                       API gateway (Hono on Node)                   │
│   auth (Clerk) · rate limit · per-tenant scoping · audit log      │
└──────┬───────────────┬─────────────┬──────────────┬───────────────┘
       │               │             │              │
       ▼               ▼             ▼              ▼
   Postgres        Redis        Agent Runner    Connector svc
   (Neon)        (Upstash)      (Trigger.dev)   (per-integration
                                                  worker pool)
       │               │             │              │
       │               │             ▼              │
       │               │         Anthropic /        │
       │               │         OpenAI / OpenRouter│
       │               │             │              │
       └───────────────┴─────────────┴──────────────┘
                              │
                              ▼
                     Object store (R2)
                     · generated assets
                     · long agent traces
                     · launch dashboards snapshots
```

## Tech choices

| Concern | Pick | Why |
|---|---|---|
| Web | Next.js 15 (App Router), React Server Components | best DX; one team can ship marketing + app |
| API | Hono on Node 22 | small, fast, tRPC-friendly |
| Auth | Clerk | OAuth providers + orgs out of the box; cheap at our scale |
| DB | Postgres (Neon) | branching for previews, scale-to-zero, pgvector |
| Cache / queues | Redis (Upstash) | serverless, pay-per-request |
| Background jobs / agents | Trigger.dev v3 | durable runs, retries, schedules, free tier |
| Object store | Cloudflare R2 | egress-free, S3 API |
| Search | pgvector + tsvector | one DB; defer Pinecone/Turbopuffer until needed |
| Analytics (us watching us) | PostHog (self-host or cloud) | event + product analytics |
| Analytics (us serving customers) | Custom on PostHog + ClickHouse | can fan out per-tenant |
| LLM | Anthropic primary (Sonnet 4.6 default, Opus 4.7 for hard plans, Haiku 4.5 for cheap), OpenRouter as escape hatch | cost flexibility |
| Agent framework | Claude Agent SDK + custom orchestrator | tool-use first-class, MCP compatible |
| AI observability | Langfuse (self-host) | open source, cheap, OpenTelemetry compatible |
| Eval harness | Braintrust or in-house | per-agent gold sets |
| Email transactional | Resend | DX for solos; Postmark fallback |
| Browser automation | Browserbase | for Reddit/LinkedIn flows where API is restricted |
| Web scraping | Firecrawl + Apify | competitor + ICP discovery |
| Payments (us) | Stripe | standard |
| Payments (customer attribution) | Stripe + Lemonsqueezy + Paddle + Polar webhook ingestion | meet founders where they are |
| Secrets (BYOK) | Per-tenant envelope encryption with AWS KMS or 1Password Connect | keys never in plain logs |
| CI/CD | GitHub Actions → Vercel + Trigger.dev deploys | boring |
| IaC | Terraform for KMS, R2, CF Workers, DNS | only where state matters |

## Data model (sketch)

```
users (clerk_id, email, ...)
tenants (id, owner_user_id, plan, byok_status)
products (id, tenant_id, url, brief, icp_json, positioning_json, voice_embedding)
launches (id, product_id, scheduled_at, status, plan_json)
agent_runs (id, launch_id, agent_type, status, input, output, cost_usd, latency_ms, parent_run_id)
agent_traces (run_id, span jsonb, gin index) -- mirrored to Langfuse
artifacts (id, launch_id, kind ['tweet','email','seo_page',...], status ['draft','approved','published'], content, channel, scheduled_at, published_at, external_id)
channels (tenant_id, kind, oauth_token_encrypted, scopes, expires_at)
events (tenant_id, ts, kind, properties_jsonb) -- analytics fact table; partitioned by day
attribution_links (id, launch_id, channel, utm_source, short_url, hits, signups, paying)
revenue_events (tenant_id, ts, source ['stripe','ls','paddle','polar'], external_id, amount_cents, customer_email, attribution_link_id)
insights (id, tenant_id, ts, severity, title, body_md, recommended_actions_jsonb, dismissed_at)
api_keys_byok (tenant_id, provider, encrypted_key, kek_id, last_used_at, scopes)
audit_log (tenant_id, actor, action, target, ts, meta_jsonb)
```

Partition `events` and `agent_traces` by day. TTL old partitions per plan tier (7d / 30d / 90d / 365d).

## Agent runtime

Three tiers of execution:

1. **Inline agent calls** (< 30s, single LLM call + tool use): served on the API edge.
2. **Workflow runs** (< 30 min, multi-step): Trigger.dev tasks, durable, retryable.
3. **Continuous agents** (always-on, scheduled): Trigger.dev cron + queue topology.

Every agent run emits OpenTelemetry traces → Langfuse. We persist input/output to Postgres for debug + replay. We **never** log PII or BYOK keys.

### Standard agent contract

```ts
type AgentRunInput = {
  tenantId: string;
  launchId: string;
  agentType: AgentType;
  context: { productBrief; channelTokens; recentEvents; voiceEmbedding };
  userInstruction?: string;
  budgetUsd: number;
  modelHint?: 'haiku' | 'sonnet' | 'opus';
};

type AgentRunOutput = {
  artifacts: Artifact[];   // drafts queued for approval
  insights: Insight[];      // observations to surface to user
  followUps: AgentRunInput[]; // recursive
  costUsd: number;
  evals?: EvalScore[];
};
```

The orchestrator turns `followUps` into new runs, capped by a budget per launch (default $5/launch on Free, $25/launch on Pro, unlimited on BYOK).

### Model routing

- Default: **Sonnet 4.6** for generation; **Haiku 4.5** for classification/triage; **Opus 4.7** for planning the 90-day Launch Plan only.
- Prompt caching: every agent has a stable system prompt and a cached `<context>` block (product brief, voice samples). Hit rate target > 70%.
- BYOK: when `tenant.byok_status = active`, the API gateway routes to the user's key (Anthropic or OpenAI via OpenRouter normalization). Usage logged for the user's own observability dashboard.

## Connectors

Each integration is a small, isolated worker with a uniform interface:

```ts
interface Connector {
  id: 'twitter' | 'linkedin' | 'reddit' | 'resend' | 'producthunt' | ...;
  authKind: 'oauth2' | 'apiKey' | 'browserSession';
  capabilities: Capability[]; // e.g. 'post', 'schedule', 'readEngagement'
  preflight(tenantId): Promise<HealthReport>;
  execute(tenantId, action: Action): Promise<Result>;
  webhook?(payload): Promise<Event[]>;
}
```

This lets us add the next connector in ~1 day. (See `INTEGRATIONS.md` after research for the full list.)

## Security & isolation

- Per-tenant Postgres row-level security; every query carries a tenant filter.
- BYOK keys: AES-256-GCM per-tenant DEK, wrapped by KMS KEK. Decrypt only in agent worker memory; never log; rotate quarterly.
- OAuth tokens: same envelope encryption. Refresh tokens rotated proactively.
- Egress allowlist on agent workers (browserbase, anthropic, configured connectors only) to prevent prompt-injection-driven SSRF.
- Strict content sandboxing: any HTML/MD generated by agents is rendered with DOMPurify; URLs from agents go through a domain reputation check before we publish on a user's behalf.
- Audit log is append-only and exported to R2 daily.
- Cookie-domain isolated subdomain for embedded analytics snippet so it can't read host cookies.

## Observability

| Layer | Tool |
|---|---|
| App errors | Sentry |
| Logs | Axiom (structured JSON) |
| Metrics | Prometheus → Grafana, or Vercel Analytics if simpler |
| Traces (HTTP) | OpenTelemetry → Honeycomb or Tempo |
| AI traces | Langfuse |
| Uptime | Better Stack / Checkly |
| Synthetic agent tests | Trigger.dev cron runs canary agent against a staging tenant |

SLOs: API p99 < 1s; agent run failure rate < 1% on retry; published-content moderation false-negative rate < 0.1%.

## Cost model (target unit economics)

Per active design partner per month, expected agent invocation profile:

- F1 daily next-action build × 30 days: ~30 LLM calls.
- F2 inbox triage classifications + drafts: ~120 LLM calls.
- Monitor model on every outbound: ~60 LLM calls.
- Background ingest + ranker tuning: ~30 LLM calls.
- Total ~240 calls/mo, avg 6k tokens IO each, ~70% cache hit on input.

Anthropic Sonnet cost ≈ $3/M input · $15/M output · cached input $0.30/M via LiteLLM.

Per-partner LLM cost ≈ $5–8/mo. Per-launch take-rate cap is $500, so gross margin on a single attributed launch is ≥ 95% net of LLM cost; the binding constraint is partner conversion to attributed paying customers, not COGS.

## What we will NOT build (explicitly)

- Our own LLM. We are users of frontier models.
- Our own analytics database from scratch. We start on PostHog + ClickHouse.
- A no-code page builder. We embed Framer/Webflow integrations.
- A CRM. We integrate Attio / HubSpot.
- Native mobile app. PWA + emails are enough for v1.
