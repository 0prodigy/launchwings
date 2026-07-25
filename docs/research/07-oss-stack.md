# Research Dossier 07 — OSS-First Stack Manifest

*Source: parallel research agent, May 2026. Senior Staff Engineer assessment for 2-engineer team.*

> Philosophy: a 2-person team running an AI-heavy multi-channel multi-tenant launch platform cannot afford to operate ClickHouse, Kafka, a vector DB, an auth server, a session-replay backend, a billing engine, AND a CRM in addition to the agent platform that *is* the product. The system doc was 80% right. Below are the deltas.

## Stack manifest (one canonical line per capability)

```
Web:                Next.js 15 (App Router, RSC) — MIT
API:                Hono on Node 22 — MIT
Auth:               Clerk (hosted) — escape: Better-Auth (MIT)
DB:                 Neon Postgres
ORM:                Drizzle (Apache 2.0, with crudPolicy() for RLS)  ← was Prisma
Cache/queue:        Upstash Redis (serverless)
Background jobs:    Trigger.dev v3 (Apache 2.0)
Cron / schedules:   Trigger.dev cron (same install)
Agent framework:    Claude Agent SDK + Mastra (TS workflows)         ← Mastra new
LLM providers:      Anthropic primary, OpenRouter for BYOK + failover
AI gateway:         LiteLLM self-host (MIT) — caching, budgets       ← NEW LAYER
AI traces:          Langfuse Cloud (free) → self-host at scale
AI evals:           Promptfoo (MIT, CLI in CI) + Langfuse datasets   ← was Braintrust
Browser auto:       Browserbase + Stagehand SDK (MIT)
Web scraping:       Firecrawl (Apache 2.0) + Crawl4AI overflow
Product analytics:  PostHog Cloud (events + replay + flags + A/B)
Session replay:     PostHog (same install — DO NOT add OpenReplay)
Feature flags / AB: PostHog (same install — DO NOT add GrowthBook)
Email transactional:Resend (product/agent outbound)
Email security:     Postmark (account/auth — separated IPs)         ← important
Newsletter integr:  beehiiv API primary, Kit secondary
Waitlist + referral:Build on Postgres (this IS our product)          ← non-negotiable
Forms:              Formbricks self-host (AGPLv3 — Docker only)
Affiliate (user):   Rewardful (recommend; commission to us)
Billing (us):       Stripe Billing
Billing (users'):   Webhooks from Stripe + LS + Paddle + Polar
CMS:                MDX + content collections (no CMS)               ← decisive
Programmatic SEO:   Postgres seo_pages table, ISR rendered
UI components:      shadcn/ui (vendored, MIT)
Charts:             Tremor (Apache 2.0, on Recharts)
Notifications:      Novu Cloud (MIT; in-app + email + Slack + push)
Approval inbox UX:  Build on shadcn/ui (Linear-inbox-style)
CRM (cold outreach):Build minimal on Postgres                        ← not Twenty
Content moderation: OpenAI Moderation API (free) + Llama Guard 4 (fal.ai)
Status page:        Better Stack free → OpenStatus (AGPL) self-host
Customer support:   Plain ($29/mo, dev-first inbox)
Public docs:        Mintlify Hobby (free)
Vector search:      pgvector on Neon
Object storage:     Cloudflare R2 (egress-free decisive)
Secrets (app):      Infisical self-host (MIT)                       ← not Doppler/Vault
Secrets (BYOK):     AWS KMS envelope encryption per tenant
Captcha:            Cloudflare Turnstile (free, no per-MAU)
Image generation:   fal.ai (Flux 1.1 Pro / Flux Dev)                ← 30-50% cheaper than Replicate
PDF rendering:      Gotenberg self-host + React-PDF templates
Audit log:          Postgres append-only + SHA-256 hash chain (build)
```

## Key deltas vs current SYSTEM.md

1. **Prisma → Drizzle** — Drizzle's `crudPolicy()` ships first-class Postgres RLS; Prisma has none and you write raw SQL hoping it doesn't conflict with the query engine.
2. **Add LiteLLM as gateway layer** — between app and Anthropic/OpenRouter. MIT, single Node container, gives per-tenant budget caps + Redis semantic caching (cross-call hits beyond Anthropic's prompt cache) + OpenAI-compatible API surface for one-config provider swap.
3. **Add Mastra above Claude Agent SDK** — typed-workflow layer for composable agent graphs. 22k+ stars, hit 1.0 Jan 2026, used by Replit Agent 3 and SoftBank in prod.
4. **Promptfoo (MIT, OpenAI-acquired) over Braintrust** — Braintrust hybrid-deploy gated to Enterprise; closed-source. Promptfoo is YAML golden sets, CLI, runs in CI.
5. **Resend + Postmark dual-rail** — Resend mixes broadcast + transactional on same IPs. Spam complaint from one tenant should NOT knock out platform's password resets. Postmark for auth/security only.
6. **No CMS for our marketing site** — MDX in `app/content/` with content-collections or velite. For *user* programmatic SEO pages: Postgres `seo_pages` table + ISR. Payload/Sanity/Strapi all assume content teams; we have 2 engineers and an agent that writes Markdown.
7. **Build a CRM, don't adopt one** — for cold-outreach data inside LaunchWings, ~4 tables on Postgres. Twenty.com is AGPLv3 and immature; Attio/Folk are SaaS ($24+/seat/mo).
8. **Novu Cloud for notifications** — in-app + email + Slack + push from one API. Knock jumps from free to $250/mo with no middle. Courier closed-source-only.
9. **Build the waitlist + referral on Postgres** — solopreneur using LaunchWings expects us to do their waitlist, not push them to getwaitlist.com. 1 table, 1 CTE for referral mechanic. 2-day implementation.
10. **fal.ai over Replicate for images** — 30-50% cheaper for same Flux models. Flux Dev ~$0.025/image at 1024×1024.

## License caveats that affect our commercial model

- **AGPLv3** (Twenty, Skyvern, Formbricks core, OpenStatus, Listmonk, Plausible CE). **Safe when running upstream Docker images** (we're a "user," not "modifier-as-service"). **Dangerous if we fork and modify** — would force AGPL on our modifications.
  - **Rule for the team**: do not fork AGPL projects. Do not paste AGPL source into our codebase. Run them as-is via Docker.
- **BSL** (HashiCorp Vault, Sentry FSL variant, Redis SSPL/AGPL-RSAL). Prohibits offering as competing service. Vault internal-use OK; do not adopt new BSL tools without checking the additional-use grant.
- **Elastic License 2.0** (Phoenix/Arize). Restricts offering as managed service. Probably safe for us as users; prefer Langfuse (MIT) anyway.
- **SSPL** (MongoDB, Elastic). Don't adopt without legal review.

## DO NOT use list

| Tool | Reason |
|---|---|
| **Braintrust as primary evals** | Closed-source, hybrid-deploy Enterprise-only |
| **Apify as primary scraper** | Compute-Unit billing makes cost projection impossible |
| **GitHub Actions as production scheduler** | Reliability issues, Jan 2026 platform outage, 60-day repo-inactivity auto-disable |
| **Doppler over Infisical** | Doppler closed-source; Infisical MIT and equivalent |
| **HashiCorp Vault for new deployments** | BSL + per-client pricing + complexity hostile to 2-person team |
| **Mintlify Pro at $300/mo** | Hobby is free; we don't need SSO or AI search until much later |
| **Cachet for status pages** | Last release 2023, "rebuilding for v3" with no shipping date |
| **Skyvern for browser flows** | AGPLv3 + we'd run as network service to users → murky AGPL |
| **PostHog self-host as default Year 1** | Community-build only now; full Kafka+ClickHouse+PG+Redis+ZK is half-day/week ops |
| **Build our own browser pool** | Chromium memory leaks, IP rotation, captcha — months of eng for no win |
| **Build our own affiliate platform** | Rewardful + Stripe key beats 10 weeks of commission accounting we'll get wrong |
| **Twenty as user-facing CRM** | AGPLv3 + immature; build minimal on Postgres |
| **Drizzle Studio for production admin** | Dev-only; build a custom admin route |

## Cost baseline

Third-party fixed cost at launch:
- Clerk (free) + Neon ($25) + Trigger.dev ($10) + Resend ($20) + Postmark ($15) + Browserbase ($99) + Better Stack (free) + Plain ($29) + PostHog (free) + Novu (free) + R2 ($5–15) + Turnstile (free) ≈ **$200–250/mo before LLM costs**, scaling linearly with paying customers.

Every >$50/mo line item has an OSS migration path documented.

Self-hosted services to maintain: **3** (LiteLLM, Infisical, optionally Gotenberg/Langfuse).

## Sources

WorkOS-vs-BetterAuth-vs-Clerk, LogRocket Next.js auth 2026, Trigger.dev-vs-Inngest-vs-Hatchet 2026, Mastra TS agent framework 2026, Helicone LLM gateway, LiteLLM alternatives, Firecrawl LLM observability, Laminar Langfuse alternatives, Stagehand, Browserbase pricing, Skyvern repo, Apify alternatives, PostHog vs Plausible, Resend vs Postmark 2026, beehiiv vs ConvertKit 2026, getwaitlist pricing, Formbricks license, Rewardful alternatives, Polar review, Lago, Payload pricing 2026, Untitled UI react libraries, Recharts vs Tremor vs Nivo 2026, Novu vs Knock vs Courier 2026, Twenty vs Attio 2026, OpenAI Moderation pricing, OpenStatus best-OSS, F3FundIt support 2026, GitHub Actions cron reliability, LeanOps vector DB cost 2026, R2 pricing 2026, Infisical vs Doppler vs Vault 2026, Turnstile GA, Cap.js alternatives, fal.ai vs Replicate 2026, Gotenberg vs Browserless, Bytebase Drizzle vs Prisma, Neon pricing 2026, Mintlify pricing 2026, Promptfoo, Inspect AI, Postgres tamper-evident audit trails, Claude Agent SDK 2026 production patterns.
