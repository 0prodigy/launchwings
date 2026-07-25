# SAFE-01 — Safety pipeline (F5)

*Status: P0. Sequencing: Phase 1 (Wk 3–6) — log-only; Phase 2 (Wk 7–10) — enforcing.*

## Why this exists

`docs/product/PRD.md` F5. Every outbound from PROD-01 / PROD-02 / the plug-points routes through one pipeline: `draft → monitor model → per-channel rate cap → tenant OAuth → audit chain`. A free Claude plugin cannot replicate this — it runs in-session, has no server-side token vault, cannot enforce rate caps across sessions, and cannot produce a hash-linked chain that survives the session.

## What it is

Four ordered stages, each enforced server-side:

1. **Monitor model** — toxicity / brand / policy / channel-specific ban patterns. Named user-visible slice: **shadowban-prevention firewall** — pre-publish gate on Reddit posts that classifies the first 2 sentences for promo language and blocks + suggests rewrite if classified as promotional. Per-subreddit rules cache refreshed weekly.
2. **Per-channel rate cap** — Redis token-bucket keyed `(tenant, channel)`. Limits documented in `docs/architecture/TRUST_SAFETY.md`. Channel-specific per `@safety-lead` review.
3. **Tenant OAuth dispatch** — calls the connector with the tenant's stored token (envelope-encrypted at rest).
4. **Audit chain** — append-only hash-linked rows in Neon. Every outbound writes one row with `(tenant_id, launch_id, channel, payload_hash, monitor_verdict, rate_cap_decision, dispatch_status, ts, prev_hash)`. Tenant sees this as the "Audit" tab on every launch.

## Acceptance criteria

1. `pipeline.send({ tenant, channel, payload })` returns within p95 ≤ 2s end-to-end including monitor model call.
2. 100% of outbound through every plug-point traces back to one `audit_chain` row.
3. Hash chain verifies on per-tenant basis — corrupting any row fails verification of all subsequent rows.
4. Monitor-model false-positive rate ≤ 15% on legitimate posts (eval set of 200 partner-approved posts).
5. Shadowban firewall: false-negative ban rate ≤ 5% on shipped Reddit posts (measured rolling 30d).
6. Rate cap rejections surface to the user with the remaining cap window ("you've sent 24/25 X posts today — try again in 2h").
7. "Audit" tab in the dashboard renders every row for a launch with copyable canonical hash.

## Tech

- `apps/api/src/safety-pipeline.ts` — Hono route + the four-stage orchestrator.
- `packages/safety/monitor.ts` — monitor model wrapper (LiteLLM gateway to Claude Sonnet).
- `packages/safety/shadowban-firewall.ts` — first-2-sentence classifier + subreddit-rules cache.
- Redis (Upstash) token-bucket implementation; one bucket per `(tenant, channel)`.
- Drizzle: `audit_chain` table with `prev_hash` FK to prior row per tenant.
- `apps/web/app/(dashboard)/launches/[id]/audit/page.tsx`.

## Out of scope

- Audit-chain replay (writes only in v1 per `docs/operations/ROADMAP.md`).
- Cross-tenant chain export / SOC 2 audit prep (post Phase 4).
- Mail-warming / IP rotation / DKIM-DMARC (calendar-bound Phase 4+).

## Dependencies

- LiteLLM gateway operational.
- Redis (Upstash) provisioned.
- CN-06/07/08 OAuth connectors for the dispatch step.

## Tests + observability

- Property test: hash-chain corruption is detected on any row.
- Property test: rate-cap bucket cannot be drained below 0.
- Langfuse trace per monitor-model invocation.
- Sentry alarm on monitor-model latency p95 > 1.5s rolling 5min.

## Owner hand-off

When green, every downstream feature (PROD-01, PROD-02, PLUG-01/02/03, REDIR-01 channel-link rewrites) routes through `pipeline.send`.
