## DOGFOOD-LRS-10 — Set RESEND_API_KEY in production + add capture-destination evaluator

**Intent**: Stage 1 item 15 fails. `POST /api/waitlist` returns HTTP 503 `Email service is not configured` because `RESEND_API_KEY` is unset in Vercel production. Form looks like it works (waitlist-form.tsx renders the success state only on `res.ok`, which 503 is not — fixed in commit `c60f66d`), but the destination is broken.

**Acceptance (site / ops)**:
- Founder sets `RESEND_API_KEY` in Vercel project settings (Production scope) — secret travels founder-laptop → Vercel UI directly per dogfood learning #11. Do **not** route through chat / agent.
- After deploy, `curl -X POST https://launchwings.com/api/waitlist -H 'content-type: application/json' -d '{"email":"akash+lrs-test-1@launchwings.com"}'` returns HTTP 200 `{"ok":true,"queued":true}` AND a real welcome email arrives at the test inbox within 60s.
- Verified at audit time and re-asserted at every deploy by the synthetic monitor below.

**Acceptance (evaluator)**:
- `captureDestination` evaluator: discover the form `action` URL, POST a synthetic email of the form `audit+${runId}@launchwings.com` (plus-addressing) with header `X-LaunchWings-Audit: 1`. Site SHOULD whitelist this header to avoid persisting the audit row but still send the welcome email so we can confirm deliverability.
- Audit inbox: a dedicated mailbox (Cloudflare Email Routing → existing `social@launchwings.com` with subject filter) polled via IMAP for the welcome email tagged with `runId`. Fail if not delivered within 60s.
- Output: `{form_action: string, http_status: number, email_delivered_within_s: number|null}`.
- This evaluator generalises learning #10 — every customer site we audit gets the same synthetic-monitor treatment.

**Estimate**: 0.25d ops + 1.5d evaluator (mailbox polling is the time sink). **Owner**: founder (ops) + AI eng. **Deps**: `EMAIL-001` (synthetic email-pipeline monitor — already a captured platform feature).
