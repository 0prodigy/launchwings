## DOGFOOD-LRS-12 — Waitlist API returns success when Resend send throws

**Intent**: `apps/web/app/api/waitlist/route.ts:87` swallows a thrown `resend.emails.send()` error and returns `{ ok: true, queued: false, warn: "send_failed" }` with HTTP 200. The frontend (and any client) only inspects `res.ok` (HTTP 2xx), so this presents as a success toast while no email ever leaves the building. Same shape as learning #10 (silent-fail when `RESEND_API_KEY` was missing) — that path was hardened in commit `c60f66d` to return 503, but the catch arm of the actual send was missed. We hit this on 2026-05-08: the form succeeded but no email arrived because the `launchwings.com` sending domain wasn't yet verified in Resend, so Resend returned an error from `send()` that landed in this catch.

This is exactly the class of bug the LRS Audit Agent is supposed to catch (learnings #10 + #12 cluster: "advertised capability vs actual capability"). Before that agent ships, harden the route.

**Acceptance (site)**:
- When `resend.emails.send()` throws, the route responds **HTTP 502** with `{ ok: false, message: "Could not send confirmation email. Please try again in a few minutes." }`. (502 because the failure is from an upstream dependency we proxy to, not a config bug like the missing-key 503.)
- The frontend's existing `if (!res.ok) showError(...)` branch handles the 502 correctly without code change. Verified by reading `apps/web/app/page.tsx` (or wherever the waitlist form lives) — no client edit needed if it already gates on `res.ok`.
- The thrown error is still `console.error`'d with the email + provider message so the founder sees it in Vercel logs.
- The success-path response (`{ ok: true, queued: true }`) is unchanged.
- Confirmed by running `pnpm --filter @launchwings/web build` (or pre-monorepo equivalent) green.

**Acceptance (evaluator, deferred)**:
- Adds to `EMAIL-001` synthetic monitor scope: probe `/api/waitlist` weekly with a known-flagged sentinel email; confirm the response is the expected ok-shape AND the test email lands at the founder's monitoring inbox within 60s.
- The catch-arm shape ("upstream send threw → must surface as non-2xx") becomes a generic evaluator pattern in the audit agent: any handler that catches and returns 2xx is a smell unless it explicitly enqueues a retry pipeline that the user can verify.

**Why we can't just retry inline**: a single `resend.emails.send()` call already retries internally. A second-level retry here just delays the user's feedback. The right pattern is to surface the failure honestly and (later) push to a queue with operator visibility.

**Out of scope here**:
- Loops drip / nurture sequence (deferred per `HANDOFF_NEXT_PHASE.md` until >50 signups).
- Persistent waitlist storage (Resend founder-notify is the storage tier until >50 signups).
- Frontend rewrite — the existing form already honors `!res.ok` (verified before merge).

**Estimate**: 0.25d (literal one-line edit + verify). **Owner**: AI eng. **Bundle**: 5 (approve+schedule plumbing) + 12 (T&S).
