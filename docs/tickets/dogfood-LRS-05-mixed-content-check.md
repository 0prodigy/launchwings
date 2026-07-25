## DOGFOOD-LRS-05 — Headed-browser mixed-content evaluator

**Intent**: Stage 1 item 6 has two halves — TLS validity (passes today) and mixed-content (untested). Build the headed-browser piece because regex on shipped HTML cannot catch runtime asset loads.

**Acceptance**:
- LRS Audit Agent gains a `mixedContent` evaluator that drives a Browserbase / Playwright session (already an allowed egress per `SETUP-11`), navigates to the target URL, listens for Chrome DevTools Protocol `Log.entryAdded` events with category `network` or `security`, and counts any entry containing `Mixed Content:`.
- TLS half (already runnable from Bash): assert cert chain via Node's `tls.connect`, reject if `notAfter < now + 14 days`.
- Verdict: fail on any mixed-content entry; warn if cert expires in <30 days.
- Live verification on launchwings.com: 0 mixed-content entries (we ship Cloudflare Turnstile from `https://challenges.cloudflare.com/...` and PostHog from `https://us.i.posthog.com` — both HTTPS, expected to pass).
- Output stored as artifact for diffing.

**Estimate**: 1d. **Owner**: AI eng. **Deps**: `SETUP-11` (egress allowlist must include Browserbase).
