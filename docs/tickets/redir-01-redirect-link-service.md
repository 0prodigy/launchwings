# REDIR-01 — Canonical redirect-link service (F6.a)

*Status: P0. Sequencing: Phase 3 (Wk 11–12).*

## Why this exists

`docs/product/PRD.md` F6. The take-rate model depends on causal, server-side attribution of paying customers to LaunchWings-orchestrated channels. Stripe webhooks alone fire on payment, not on the channel that drove the signup — they cannot prove causation. This service captures the click server-side and signs the round-trip param that the matcher (ATTR-01) verifies.

## What it is

A server-side endpoint at `app.launchwings.com/go/[launchId]`. Every channel link LaunchWings publishes is rewritten to point at this endpoint. On click:

1. Worker reads `launchId → destination` mapping. **Source of truth is Neon**; KV is a hot read-through cache populated cache-aside on miss. KV's up-to-60-second write-propagation window makes it unsafe as authoritative storage for a launch URL created at signup and posted minutes later — first EU clicks would 404.
2. Click writes one `redirect_click` row (fire-and-forget to a Cloudflare Queue, never blocks the 302) with `(launch_id, click_id, ts, referrer, ua, ip_cohort_hash, channel_slug, signed_lw_lid)`.
3. HMAC-SHA256 `lw_lid` signed over `(launch_id, click_id, ts)` is appended to the destination URL as `?lw_lid=…`. Cookie set on the LaunchWings-scoped domain only.
4. 302 redirects to the destination within p95 ≤ 500ms across us-east, eu-west, ap-southeast.

## Acceptance criteria

1. `GET /go/[launchId]` returns 302 within p95 ≤ 500ms from three regions, measured via hourly synthetic probes.
2. Every click writes exactly one `redirect_click` row with all required columns; no PII (raw IP stored as cohort hash).
3. The `lw_lid` is HMAC-SHA256 over `(launch_id, click_id, ts)` with a key from Infisical; 7-day TTL; tamper-rejected by ATTR-01.
4. Cookie set on `*.launchwings.com` only; no cross-site cookie attempt.
5. `redirect_click` write failure does NOT block the 302 — clicks lost on warehouse outage are tolerable; redirect failures are not.
6. Fresh launch URLs (created < 5 minutes ago) resolve correctly from all three regions on first click — verified by an integration test that creates a launchId at t=0 and probes from all regions at t=5s, t=30s, t=60s.

## Tech

- Cloudflare Workers + Workers KV (hot cache) + Cloudflare Queue (async click capture) + Cloudflare Durable Object (per-launch rate-limiter + click-dedup window).
- Neon is authoritative for `launchId → destination` mapping. Worker reads KV on hot path; cache-miss falls through to Neon via tRPC + populates KV.
- HMAC key in Infisical, rotated on the same schedule as other app secrets.
- LRS Stage-1 evaluator `redirect-link-reachable` added — green when the launch's `launchId` resolves to a 302 within 500ms p95 across the three regions.

## Out of scope

- The attribution matcher (ATTR-01).
- Take-rate billing logic (BILL-01).
- Per-tenant analytics dashboard for redirect health (deferred until data flows).

## Failure modes addressed

1. KV propagation lag on fresh launchId — cache-aside fallthrough to Neon prevents 404.
2. Worker cold-start spike — pre-warm via synthetic ping cron.
3. Founder's site is down — we still 302; their failure is not ours to absorb.
4. Click flood (one viral X post) — DO rate-cap per `launch_id` at 1k/s; spillover dropped with a warning header.
5. Signed `lw_lid` collision — astronomically unlikely with full HMAC; matcher de-dups on `(launch_id, click_id)` not `lw_lid`.

## Dependencies

- Cloudflare account provisioned with Workers, KV, Queue, Durable Object access.
- Infisical key vault available for HMAC secret.
- One Drizzle migration slot for `redirect_click` table.

## Tests + observability

- Unit: signed-param round-trip, expiry, tampering rejection.
- Integration: 1000-click load test from one region, verify p95 < 500ms.
- Multi-region synthetic probe (hourly canary): all three regions ≤ 500ms.
- Cache-aside test: create launchId at t=0; probe from a fresh region at t=5s; verify Neon-fallthrough resolved correctly.
- Sentry alarm on 5xx > 0.5% rolling 5-min.

## Owner hand-off

When green, hand off to ATTR-01 which consumes the `redirect_click` rows and matches them to `customer.created` events.
