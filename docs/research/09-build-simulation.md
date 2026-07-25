# Research Dossier 09 — Build Simulation & Cross-Cutting Blockers

*Source: parallel research agent (Principal Engineer simulating tomorrow's kickoff). The most important dossier in this set — exposes the architectural gaps a junior would crash into.*

> Walked through 6 of the highest-risk features step-by-step. Did not write code. Surfaced blockers, ToS landmines, race conditions, edge cases, and ambiguities a junior engineer would hit.

## Per-feature build-time honesty (1 engineer)

| Feature | Estimate (junior) | Reality | Δ |
|---|---|---|---|
| BYOK + KMS + per-agent routing | 1 week | **5 weeks** | 5× |
| Reddit submission + rule compliance | 2 weeks | **6 weeks** | 3× |
| Live Launch Dashboard 5s refresh | 3 weeks | **8 weeks** | 2.7× |
| Programmatic SEO at 200 pages | 2–3 weeks | **6 weeks** | 2× |
| Reddit/forum engagement (find threads + draft) | 2 weeks | **5 weeks** | 2.5× |
| Approval Inbox + idempotent publish pipeline | 2 weeks | **5 weeks** | 2.5× |

**Total realistic for 6 features: 35 engineer-weeks.** This corroborates the feature-bundle dossier's brutal capacity math.

## Major architectural gaps surfaced

### A. SSE / realtime on Vercel doesn't work

PRD F3 says "Live Launch Dashboard with 5-second refresh via SSE." Vercel functions have a 60s timeout (Pro) or 300s (Enterprise) — **not enough for SSE persistent connections**. SYSTEM.md doesn't address this.

**Decision needed Week 1:** Cloudflare Workers + Durable Objects, OR Ably/Pusher hosted, OR Fly/Railway long-running worker. **Not Vercel functions.**

### B. Programmatic SEO hosting — unanswered $2-month decision

Three options, each with serious tradeoffs:
- **(a) Subdomain on user's domain** (`go.theirdomain.com`) — Cloudflare for SaaS + DNS + SSL setup. Limited backlink benefit.
- **(b) Subdirectory on user's domain** (`theirdomain.com/compare/...`) — best SEO; needs reverse proxy user must configure. Hard for non-technical users.
- **(c) Our subdomain** (`their-handle.launchwings.com`) — easiest; SEO juice goes to us not them. Bad for user's organic moat.

**Path forward**: default (c) for Free, offer (a) for Pro, (b) for Scale. SYSTEM.md must specify or this becomes 2 months of indecision.

### C. Programmatic SEO is the single biggest legal/reputational risk

Google's HCU (March 2024 + followups) targeted "scaled content abuse." Auto-generated low-value pages can trigger **manual actions on the user's whole domain** — catastrophic, lawsuit-worthy.

**Required mitigations:**
- TOS clause with explicit consent.
- Quality threshold (LLM judge ≥0.85 per page).
- Manual review of first 20 pages per launch.
- Cap MVP at 20 high-quality pages.
- 50–70% non-indexing rate is realistic; selling "200 SEO pages" implies traffic but reality is maybe 30–60 indexed and 5–10 ranking.

**Engineer's recommendation: don't ship pSEO for v1, OR cap at 20 high-quality pages, OR only on our subdomain.**

### D. Adblock blocks first-party analytics ~30% of EU/tech audience

Embed snippet (`embed.launchwings.com/v1.js`) gets blocked by adblocker for ~30% of users. To collect attribution we need a Plausible-style proxy via the user's own domain (CNAME-based) — **a real engineering project** unscoped in spec.

Plus EU cookie-consent banners block our cookie. We need a "cookieless mode" using IP + user-agent fingerprint hash (not GDPR-clean either, but better) or accept attribution gaps in EU traffic.

### E. ProductHunt API forbids automated submission

ProductHunt's official policy: programmatic SEO ToS requires "submitting URLs doesn't guarantee indexing" + manual submission only. **Submitting a post via API is not allowed** — must be human-driven. This contradicts the directory-submitter agent's promise.

**Path forward**: Directory Submitter for PH = pre-fill form + paste-to-clipboard workflow + comment-monitoring. Not auto-submit.

### F. HN/IH/Lobsters auto-posting — engineer's hard NO

- **HN**: opaque anti-spam, brutal shadowban; **never auto-post**, only "copy to clipboard, founder pastes."
- **IndieHackers**: ToS forbids scraping; no posting API. Plan B: official RSS only. Plan C: don't include in v1.
- **Lobsters**: tiny conservative community; auto-posting comments will be detected and banned within days. Surface threads for manual review only.

**Only auto-post to Reddit (with strict caps) and the user's own social accounts (X, LinkedIn).**

### G. X Search API is in $5K/mo Pro tier — cost wall

X v2 Basic ($200/mo) = 10k posts/mo read. Search-by-URL is **Pro tier only ($5,000/mo)**. At 50k users this is a cost wall. Realistic alternative: webhooks via Account Activity (where available) + your owned tweet metrics endpoint. Or scrape via Browserbase (ToS violation, don't).

## Top 25 cross-cutting blockers

1. **No uniform approval-state machine** — every feature needs `draft → approved → scheduled → sent | failed`. Build once.
2. **Connector healthcheck pattern unspecified** — what does "healthy" mean? OAuth valid + last-success <24h + rate-limit budget? Define and enforce.
3. **OAuth refresh-token rotation** infrastructure for 10+ providers, no central refresher.
4. **Idempotency key strategy** — `(tenant, action, content_hash)` should be lifted to platform primitive.
5. **Egress allowlist** mentioned in TRUST_SAFETY but no implementation. Workers need a forward-proxy with allowlist enforced.
6. **SSE / realtime delivery** assumed but Vercel doesn't support persistent SSE (gap A above).
7. **Per-tenant geo residency** — KMS, Postgres, R2 all need regional awareness. EU + SOC 2 will surface this.
8. **Browserbase ToS exposure** — non-owned-account scraping is fragile. Per-feature decision required.
9. **Cross-tenant test harness** described in TRUST_SAFETY but not designed. Without it, RLS bugs ship.
10. **LLM judge eval harness** — Reddit, forum-engagement, approval pipeline all depend on LLM-as-critic. Need gold sets, baseline metrics, regression alerts.
11. **Content hash + spam fingerprint** uniform across channels.
12. **Token bucket / rate limiter** per (tenant, channel, day) needs Redis Lua script + tests.
13. **Audit log hash chain** — design exists, implementation non-trivial, must survive partition + replication.
14. **Webhook signature verification** patterns differ per provider. Wrap once.
15. **Cost attribution per agent run** — AI Usage Dashboard needs per-call telemetry no agent today emits.
16. **Founder voice fine-tune storage + serving** — described as "moat," not specified. Per-tenant adapter? Few-shot? RAG? Major arch decision pending.
17. **Embedding cost + provider** unspecified. Voyage vs OpenAI vs Cohere — picks differ on Anthropic compatibility.
18. **First-party analytics infra** — embed.js + edge collector + event store. ~4 weeks unscoped.
19. **Cookie-consent / GDPR mode** for embed snippet — required from day 1, no design.
20. **Approval autonomy levels** (Default / Trusted / Watchdog) need per-(tenant, agent, action-class) matrix.
21. **Suspension / appeal workflow** — TRUST_SAFETY says automatic suspension; no appeal mechanism.
22. **Time-zone correctness** — scheduled tasks, morning briefs, launch day windows. Trivial to get wrong.
23. **Trigger.dev concurrency caps per tenant** — without these, one runaway agent loop starves everyone.
24. **Customer-side webhook delivery** — when WE call user's webhook, retries + signing not specified.
25. **Per-launch budget enforcement** — `budgetUsd` is in agent contract; enforcement point and over-budget UX undefined.

## Pre-mortem: 10 ways this dies in Year 1 (engineering perspective)

Stack-ranked.

1. **Reddit/PH/X bans the platform.** One viral "this bot spammed r/SaaS" post → subreddit blocks any post linked to launchwings.com. Cascading reputation death. *Mitigation: human-in-loop default, conservative throttles, never go full autonomous in Year 1.*
2. **One BYOK key compromise → SOC 2 incident.** Single junior dev logging a key, or Sentry capturing a Buffer. *Mitigation: third-party pen-test before public launch, automated secret-scanning in CI (gitleaks, trufflehog), Sentry redaction hooks, no-debug-in-prod cultural rule.*
3. **Programmatic SEO triggers a Google manual action on a customer's domain.** Customer sues. *Mitigation: don't ship pSEO for v1, OR cap at 20 high-quality pages, OR only on our subdomain.*
4. **Anthropic / OpenAI changes reseller terms.** 30-day OpenRouter fall-back is engineering, not customer; users won't accept worse outputs.
5. **Launch dashboard is impressive but expensive, 80% of users open it once.** *Mitigation: build at 60s polling first, validate engagement before scaling realtime.*
6. **Approval fatigue.** 60 drafts/day, founder approves nothing past Day 3. *Mitigation: auto-approve "safe" classes (typo fixes, scheduled re-posts), default to "draft 5/day" not 60.*
7. **Build platform partners don't sign.** "Moat" never materializes. *Mitigation: ship value standalone first; partnerships are accelerants, not foundations.*
8. **76-item checklist is too long; users bounce in onboarding.** 8-min to first artifact is aspirational; 30 min realistic. *Mitigation: ruthless onboarding cut — 8 critical items in MVP, other 68 unlock progressively.*
9. **Cost spike from cache-miss patterns.** Any deploy that changes system prompts can drop hit rate 70%→10% overnight. *Mitigation: cache hit rate as first-class metric with alerts; freeze system prompts behind versioning.*
10. **Founder's previous-loss psychology** → over-engineering for safety, missing market, building features that "feel substantial" instead of features users will pay for in week 1. *Mitigation: $5k MRR validation gate before building dashboard 2.0, programmatic SEO, voice fine-tunes.*

## Engineer's "What I would NOT build for v1"

- BYOK with quarterly rotation, KMS multi-region, per-agent routing → ship "store + validate + use" only.
- 5-second realtime dashboard → ship 30-second polling.
- Markov attribution → ship first-touch + last-touch.
- Programmatic SEO at 200 pages → 20 pages, our subdomain only, no GSC OAuth.
- Auto-posting to HN/IH/Lobsters → surface threads, founder pastes manually.
- "Trusted" autonomy mode → full human approval on everything; earn autonomy after 6 months clean track record.
- Build-platform OAuth (Levels 3+) → stick at Level 1 (URL crawl) unless partner pre-commits.
- Launch-Day Orchestrator reactive logic → alerts only, not reactive workflows.
- Affiliate program → Day 90, not Day 14.
- Voice fine-tunes → few-shot from voice samples, no fine-tunes.
- Cross-cohort benchmarks with k-anonymity / DP → Year 2.
- 30+ directory submissions → ship the top 8.
- Notion / CMS publishing for SEO pages → our subdomain only.
- Press Agent → defer; PR hand-curated for v1.
- PWA / mobile → web only.
- Discord / Bluesky / Threads → X + LinkedIn + Reddit cover 90% of value.

## Engineer's recommended v1 (12–14 weeks, 2 engineers)

> Onboarding (URL crawl only) → Audit (Stage 1, 8 items) → Generation (one channel at a time) → **Approval Inbox + Scheduler + Outbox (the keystone)** → Simple post-launch dashboard (30s polling) → Stripe revenue tracking → Weekly Compound Report email.

**Get to $5k MRR. THEN build the rest.**
