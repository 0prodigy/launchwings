---
channel: x
status: draft
related_learning: 10
---

silent-fail bugs in solo-founder code, three flavors we hit in one week shipping launchwings:

1. waitlist API returned `ok: true` when the email send threw. UI showed "you're on the list" — no email ever left the building.

2. `<meta og:image>` pointed at a 404 PNG that didn't exist in the repo. every share to twitter / linkedin / slack was silently broken from launch day.

3. PostHog SDK shipped with `NEXT_PUBLIC_POSTHOG_KEY` unset in vercel. SDK silently no-oped. our analytics dashboard was empty for days.

every one of these passed the build, passed the deploy, and looked healthy in observability. they only break under real-world end-to-end probing.

this is a class of bug we're treating as the gold spec for our launch readiness audit agent. each of these three became a concrete evaluator that now blocks merge on every PR.

if you're shipping a v1 SaaS, you've got at least one of these right now. you just don't know it yet.

—

what's catching them for us:

— a build-time CI check that resolves every <meta>+<link> URL in shipped HTML against public/ + Next file-convention routes (took 1h to write)
— frontend gates on res.ok, route returns 502 on upstream throws (no more `ok: true` lies)
— the audit agent does a synthetic end-to-end probe: paste an email, watch the inbox, fail loud if no email arrives in 60s

bonus rule we're adopting: any handler that catches and returns 2xx is a smell unless the catch enqueues a verifiable retry pipeline.
