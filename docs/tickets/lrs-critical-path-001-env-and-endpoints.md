## LRS-CRITICAL-PATH-001 — declared-endpoint reachability + waitlist probe

**Intent**: Stage 1 needs an evaluator that catches the "advertised capability vs actual capability" cluster captured in `docs/dogfood/learnings.md` #10 (waitlist API silently accepted submissions when `RESEND_API_KEY` was missing) and #12 (`<meta og:image>` tag pointed at a 404 asset that never existed). Both bugs share the same shape: the page CLAIMS to do something, the API quietly doesn't. Generalises to any audit-time probe of declared endpoints + happy-path API contracts on a deployed marketing site.

**Acceptance (evaluator)**:
- `criticalPathEnvEvaluator` (id: `LRS-CRITICAL-PATH-001`) shipped at `packages/lrs/src/evaluators/critical-path-env.ts`.
- Self-registers via `packages/lrs/src/evaluators/index.ts`.
- Detects declared API endpoints in shipped HTML:
  - `<form action="...">`
  - `<button data-api-endpoint="...">`
- For each declared endpoint:
  - HEAD it; if HEAD throws at the network layer, fall back to OPTIONS.
  - **Verdict per endpoint**:
    - `200` / `204` / `405` → "endpoint exists" pass.
    - `404` → `fail` (declared but missing — exactly the og:image / favicon shape).
    - `5xx` → `warn` (might be config drift; surface for review).
    - Other non-2xx (`401` / `403` / `3xx`) → "endpoint exists" pass — the route is wired, it's just gating us.
- For any waitlist-shaped endpoint (action ends with `/api/waitlist` OR contains `signup` / `subscribe` case-insensitive): synthetic POST with sentinel email of shape `audit+${runId}@launchwings.com` and `X-LaunchWings-Audit: 1` header. Verify response shape (`{ok: bool, message?: string}`).
  - `2xx` with `{ok: true, ...}` → `warn` ("downstream side-effect unverifiable from audit sandbox; pair with **EMAIL-001** synthetic-monitor pattern").
  - `2xx` with `{ok: false, ...}` → `pass` (route is correctly surfacing the failure as a structured message).
  - `2xx` with non-`{ok:bool}` shape → `warn` (response shape unverified — fix the route to return the canonical shape).
  - non-2xx → `pass` (route is correctly surfacing failure — e.g. 503 when `RESEND_API_KEY` is unset, the hardened variant from learnings.md #10).
- **Verdict ladder (overall)**: any per-finding `fail` → `fail`; else any `warn` → `warn`; else `pass`. No declared endpoints at all → `pass` with score 85 (nothing to test, but worth flagging the gap).
- **Evidence**: `{ declaredEndpoints, endpointResults, waitlistResults }` — each result includes `status`, `classification`, `bodyPreview` (truncated 280 chars). Suitable for the founder UI.
- **Fix action**: per-finding bullet list naming the exact URL + status + remediation language. Pulls in the **EMAIL-001** reference for the unverifiable-2xx case.

**Live verification target** (post-fix on launchwings.com):
- `<form action="/api/waitlist">` HEADs to 405 (Next route exists); POST returns 503 with `{ok:false,message:"Email service is not configured"}` when key is unset (per the hardened route from learnings.md #10).
- POST returns 200 `{ok:true,queued:true}` once `RESEND_API_KEY` is set.

**Out of scope** (deliberately):
- **Critical-path env-var detection in compiled JS chunks** — scanning the user's deployed `_next/static/**.js` for `process.env.X` references and matching against missing-from-the-environment vars. That's the harder variant of this evaluator and will land in PR4+.
- Multi-tenant secret-broker integration that auto-fixes a missing key via the user's vendor (Resend / Stripe / etc.) — separate ticket.
- Probing the entire endpoint surface (sitemap-driven). PR3 walks only what the rendered HTML declares.
- Real downstream verification of the synthetic POST (i.e. an audit-only inbox). That's **EMAIL-001 synthetic-monitor** territory, captured in `learnings.md` #10.

**Estimate**: 0.5d. **Owner**: AI eng. **Deps**: `@launchwings/lrs` runner + `cheerio` (already a dep).

**Bundle (per docs/research/06-feature-bundles.md)**: Bundle 2 (audit) + Bundle 5 (T&S / silent-fail prevention).

**Related**:
- `docs/dogfood/learnings.md` #10 (waitlist silent-fail) + #12 (og-image 404 cluster).
- `docs/tickets/dogfood-LRS-10-waitlist-destination.md` (related; that ticket validates the END-of-pipeline destination configuration; this evaluator validates the START-of-pipeline contract).
- `docs/tickets/dogfood-LRS-12-waitlist-silent-fail.md` (the EMAIL-001 synthetic-monitor pattern this evaluator points the founder at).
- `docs/tickets/lrs-dns-001-proxy-posture.md` (template / shape for this ticket).
