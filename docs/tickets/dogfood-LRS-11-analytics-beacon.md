## DOGFOOD-LRS-11 — Analytics beacon-fire evaluator

**Intent**: Stage 1 item 17 ("Analytics installed — verified beacon fires") needs a headed browser to confirm the SDK actually phones home. Today the PostHog SDK is shipped but if `NEXT_PUBLIC_POSTHOG_KEY` is unset in Vercel production, the SDK silently no-ops — same failure mode as the RESEND key (learning #10).

**Acceptance**:
- LRS Audit Agent ships `analyticsBeacon` evaluator: drive Browserbase / Playwright, navigate to target URL, register a `Network.requestWillBeSent` listener, wait 10s post-`load` event, count outbound POSTs to known analytics ingest hosts:
  - `*.posthog.com`, `*.i.posthog.com`
  - `*.plausible.io`
  - `*.google-analytics.com`, `*.gtm.com`, `*.analytics.google.com`
  - `track.launchwings.com` (our own embed)
- Verdict: fail if no beacon fires.
- Static-analysis fallback (no headed browser): regex shipped JS chunks for known SDK init signatures (`posthog.init(`, `plausible(`, `gtag('config'`); pass = present, but always weaker than a live beacon.
- Live verification on launchwings.com: confirm at least one POST to `us.i.posthog.com` fires on first load. If it doesn't, founder sets `NEXT_PUBLIC_POSTHOG_KEY` in Vercel production (same handoff path as `DOGFOOD-LRS-10`).

**Estimate**: 1d evaluator + 0.25d ops if env var is missing. **Owner**: AI eng + founder. **Deps**: `SETUP-11` (egress allowlist must include analytics ingests we want the agent to audit on customer sites — note this is for *outbound* monitoring, not for *us* sending data).
