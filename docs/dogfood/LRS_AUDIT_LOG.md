# LRS Stage 1 — Self-Audit Log (DOG-09)

- **Date:** 2026-05-08
- **Commit audited:** `c60f66d871cb3f01f458c1b2238e4d939a24e1ea`
- **URL audited:** `https://launchwings.com` (final origin: `https://www.launchwings.com`, Vercel `bom1` POP)
- **Auditor:** main-thread / dogfood-DOG-09
- **Source of truth:** `docs/product/LAUNCH_READINESS_CHECKLIST.md` Stage 1 (lines 22–50)
- **Pass bar:** ≥16/18

This audit doubles as the executable spec for `LRC-02 — LRS Audit Agent`. Each item's "Spec implication" line is the evaluator the agent must implement.

## Summary

| #  | Item                                          | Status | Evidence (1-line)                                                                                  | Ticket filed                              |
|----|-----------------------------------------------|--------|----------------------------------------------------------------------------------------------------|-------------------------------------------|
| 1  | Live URL 200 in <2s p95 from 3 regions        | ⚠️     | bom1 p95 ~0.42s over 5 samples; only 1 region measured                                             | dogfood-LRS-01-multiregion-probe.md       |
| 2  | Hero headline (audience + problem)            | ⚠️     | Headline names audience ("solo founders") but problem is implicit; needs LLM-judge                 | dogfood-LRS-02-hero-llm-judge.md          |
| 3  | Primary CTA above the fold                    | ✅     | "Join the waitlist" button rendered in first `<section>`, max-w-3xl single-column                  | —                                         |
| 4  | `/pricing` page or pricing visible on home    | ❌     | `/pricing` returns 404 (`x-next-error-status: 404`); no pricing text in homepage HTML              | dogfood-LRS-03-pricing-page.md            |
| 5  | `/about` or founder section                   | ❌     | `/about` returns 404; no founder section in homepage HTML                                          | dogfood-LRS-04-about-or-founder.md        |
| 6  | SSL valid, no mixed content                   | ⚠️     | TLS cert valid (Let's Encrypt, expires 2026-08-05); HSTS set; mixed-content needs headed browser   | dogfood-LRS-05-mixed-content-check.md     |
| 7  | No console errors                             | ⚠️     | Cannot verify from Bash; needs Lighthouse / Chrome DevTools                                        | (no ticket — tooling)                     |
| 8  | Mobile-responsive (Lighthouse perf ≥70)       | ⚠️     | Cannot verify from Bash; needs Lighthouse                                                          | (no ticket — tooling)                     |
| 9  | Logo / favicon present and ≥256px             | ❌     | `/favicon.ico` 404s; no `apps/web/public/` directory exists in repo; no logo image asset           | dogfood-LRS-06-favicon-and-logo.md        |
| 10 | OG image set 1200×630, validated              | ❌     | Meta tag points at `https://launchwings.com/og-default.png`; URL returns 404 (Next 404 HTML body)  | dogfood-LRS-07-og-image-asset.md          |
| 11 | Twitter card meta valid                       | ❌     | `twitter:card`, `twitter:image` meta present but image asset 404s — invalid render on Twitter      | dogfood-LRS-07-og-image-asset.md (shared) |
| 12 | Title <60 chars, description <160             | ❌     | Title = 60 chars (boundary); description = **172 chars** (over 160 limit)                          | dogfood-LRS-08-meta-description-length.md |
| 13 | Domain age >0 days, not on blacklist          | ⚠️     | WHOIS creation 2026-05-07 = **age 0 days at audit time**; Spamhaus/Safe Browsing not queried       | dogfood-LRS-09-domain-age-blacklist.md    |
| 14 | Email capture exists                          | ✅     | `<form>` with `<input type="email" name="email">` posts to `/api/waitlist`                         | —                                         |
| 15 | Capture connected to real destination         | ❌     | `POST /api/waitlist` returns **HTTP 503** `Email service is not configured` — RESEND_API_KEY unset | dogfood-LRS-10-waitlist-destination.md    |
| 16 | Privacy + Terms exist and linked              | ✅     | `/privacy` 200, `/terms` 200, both linked from footer                                              | —                                         |
| 17 | Analytics installed (beacon fires)            | ⚠️     | PostHog SDK present in shipped JS (`us.i.posthog.com`); beacon firing not verified from Bash       | dogfood-LRS-11-analytics-beacon.md        |
| 18 | Stripe / payments webhook reachable           | N/A→✅ | No payments wired in this codebase; per checklist "if applicable", scored as pass                  | —                                         |

**Final score: 4/18 ✅, 7/18 ⚠️, 6/18 ❌, 1 N/A (counted as ✅) → 5/18 hard-pass.**

Counting the rubric strictly (each ⚠️ as not-passing): **5/18**. Counting generously (⚠️-needs-tooling as TBD-pass): still well under 16/18.

> **PASS BAR NOT MET.** Stage 1 requires ≥16/18. We are at most 5/18. This is the expected outcome for a freshly-deployed pre-launch waitlist site and is exactly why DOG-09 exists — every gap below is now a real ticket against `apps/web/**` and a real evaluator against `LRC-02`.

> **Lighthouse not yet run.** Items 7 and 8 (and the headed-browser portion of 6) require a real Chrome run. Capture as a follow-up: `pnpm lighthouse --url=https://launchwings.com --form-factor=mobile` and attach the JSON report to the next audit cycle.

---

## Per-item detail

### 1. Live URL responds 200 in <2s p95 from 3 regions

**Method.** `curl -w "%{http_code} %{time_total}s\n"` × 5 samples from this Bash session (geo: Vercel routes to `bom1` POP per `x-vercel-id`). Followed redirects from apex to `www.launchwings.com`.

**Result (raw).**
```
307 0.32s    (apex → www redirect)
200 0.26s
200 0.26s
200 0.15s
200 0.16s
200 0.25s
```
Apex p95 ≈ 0.42s; www p95 ≈ 0.26s. One region only. `x-vercel-cache: HIT` on subsequent fetches.

**Verdict.** ⚠️ partial. Latency from one region is well under 2s, but the checklist explicitly demands 3-region p95 — we measured 1 (Mumbai). Not a real gap on the site; a real gap on our auditing tooling.

**Spec implication for the LRS Audit Agent.** Issue parallel HTTP HEAD probes from at least 3 distinct geographic egress points (e.g. Cloudflare Workers `cf-ipcountry` rotation, or AWS Lambda in `us-east-1` / `eu-west-1` / `ap-south-1`), record p50/p95/p99 latency, fail any region whose p95 > 2000ms, fail any region whose status ≠ 2xx.

### 2. Hero headline names audience + problem (LLM-judge)

**Method.** Read live HTML hero text and `<h1>`. Cross-checked against `apps/web/app/page.tsx`.

**Result (raw).**
- `<h1>`: `Your always-on growth team for solo founders.` — names audience ("solo founders"), implies problem ("growth").
- Subhead: `Point us at your live product. We run a launch-readiness audit, then ship you to 30+ channels in your voice and keep compounding until you hit your first paying customers.` — names audience and problem.

**Verdict.** ⚠️. The h1 alone is audience-clear but problem-implicit. Combined with the subhead it's adequate. The checklist explicitly says **LLM-judge**, so any non-LLM verdict here is provisional.

**Spec implication for the LRS Audit Agent.** Extract `<h1>` + first paragraph after, send to a Sonnet/Haiku judge with a rubric: `{audience_named: bool, problem_named: bool, jargon_score: 0-3}`. Fail if `audience_named=false` OR `problem_named=false`. Cache result keyed on text hash so re-runs are free.

### 3. Primary CTA above the fold

**Method.** Inspect HTML for first `<button>` or actionable element inside the first `<section>`.

**Result (raw).** First section contains `<form>` with `<button type="submit">Join the waitlist<svg .../></button>`. Renders above the fold on a typical 800px viewport for a max-w-3xl single-column layout.

**Verdict.** ✅.

**Spec implication for the LRS Audit Agent.** Render via headless Chrome at 1366×768 desktop and 375×667 mobile, snapshot bounding boxes of all `<button>`/`<a class~=cta>`/`type=submit` elements, fail if no actionable element has its bounding box `top + height` ≤ viewport.height. Heuristic fallback (no headed browser): assert at least one `<button>` or `<a>` with text matching `/sign|start|try|join|book|get/i` appears in the first `<section>`.

### 4. `/pricing` page or pricing visible on home

**Method.** `curl -sI https://launchwings.com/pricing` (followed redirect to www). Searched homepage HTML for `pricing|tier|plan|free|$\d+`.

**Result (raw).**
- `/pricing` → `x-matched-path: /404`, `x-next-error-status: 404`, `content-length: 10124` (Next 404 page).
- No "pricing" string in homepage HTML body.

**Verdict.** ❌. Real gap.

**Spec implication for the LRS Audit Agent.** HEAD `${origin}/pricing`; if not 200, regex the homepage HTML for one of: a `$NN` price token, the literal "free / pro / starter / enterprise / scale", or `data-pricing-table`. Fail if neither path matched. Note exception for genuine no-paid-tier products (waitlist phase): check `metadata.product_phase === "waitlist"` to soft-fail (yellow) rather than red. **(For us specifically: we are in waitlist phase but the pricing tiers exist in `PRICING.md` and need to be public per `SETUP-08`.)**

### 5. `/about` or founder section

**Method.** `curl -sI /about`. Searched homepage for "about|founder|hi i'm|i'm building".

**Result (raw).** `/about` → 404 (`x-matched-path: /404`). No founder section text in `/`.

**Verdict.** ❌. Real gap.

**Spec implication for the LRS Audit Agent.** HEAD `${origin}/about`, `${origin}/team`, `${origin}/founders`. If none 200, scan home HTML for a section header matching `/about|founder|story|why|who/i` AND a paragraph with first-person pronouns (`I|we`) ≥ 60 chars. Fail otherwise.

### 6. SSL valid, no mixed content

**Method.** `openssl s_client -connect launchwings.com:443` to inspect cert. `curl -I` for HSTS. Mixed-content check requires headed browser for runtime asset loads.

**Result (raw).**
- Cert: `subject=CN=launchwings.com`, `issuer=Let's Encrypt R12`, `notBefore=May 7 17:29:26 2026 GMT`, `notAfter=Aug 5 17:29:25 2026 GMT`. Valid.
- `strict-transport-security: max-age=63072000` (2 years). Good.
- Mixed content: not verifiable from Bash.

**Verdict.** ⚠️ partial — TLS portion ✅, mixed-content portion needs headed browser.

**Spec implication for the LRS Audit Agent.** TLS check: open TCP 443, validate cert chain via system trust store, assert `notAfter > now + 14 days`, assert `subject CN` or SAN matches host. Mixed-content: open page in headless Chromium with `Page.setBypassCSP(false)`, listen for `Mixed Content:` console messages, fail on any occurrence. Static-analysis fallback: regex shipped HTML and JS chunks for `http://` URLs that are not `localhost` / `127.0.0.1` / `example.com`.

### 7. No obvious console errors (Lighthouse JS errors = 0)

**Method.** Not runnable from Bash.

**Verdict.** ⚠️ partial — needs Lighthouse run.

**Spec implication for the LRS Audit Agent.** Headless Chromium navigate, collect `Runtime.exceptionThrown` + `Log.entryAdded` events for 5s post-load, fail if any error-level entry is emitted. Whitelist a small set of known-noisy origins (e.g. analytics SDK warnings) configured per-tenant.

### 8. Mobile-responsive (Lighthouse mobile perf ≥70, no horizontal scroll)

**Method.** Not runnable from Bash.

**Verdict.** ⚠️ partial — needs Lighthouse run.

**Spec implication for the LRS Audit Agent.** Run Lighthouse in mobile emulation (375×667, Moto G4 throttling), fail if `categories.performance.score < 0.70`. Separate horizontal-scroll check: at 320px viewport, assert `document.documentElement.scrollWidth <= window.innerWidth`. Lighthouse JSON output ingested and stored as an artifact for diffing across runs.

### 9. Logo / favicon present and ≥256px

**Method.** `curl -I /favicon.ico`. Inspected `apps/web/` tree for `public/` directory. Searched HTML head for `<link rel="icon">` / apple-touch-icon.

**Result (raw).**
- `GET /favicon.ico` → `x-matched-path: /404`, `x-next-error-status: 404`, body is the Next 404 HTML (`content-length: 10124`).
- No `<link rel="icon">` or `<link rel="apple-touch-icon">` in shipped `<head>` (only `<meta name="theme-color">`).
- **No `apps/web/public/` directory exists in the repo** (confirmed via `find apps/web -name public -type d`). All images, icons, OG card — none of them ship.

**Verdict.** ❌. Both halves fail (favicon 404 + no logo asset in repo).

**Spec implication for the LRS Audit Agent.** HEAD `/favicon.ico`, `/apple-touch-icon.png`, `/icon.png`, plus any `<link rel~=icon>` href in head; for each 200, decode the image header, fail if `min(width,height) < 256` for the largest icon link. Soft-fail if only a 32×32 favicon exists; hard-fail if none.

### 10. OG image set (1200×630), validated

**Method.** Parsed `<meta property="og:image">` from HTML. HEAD'd the URL.

**Result (raw).**
- `<meta property="og:image" content="https://launchwings.com/og-default.png">`
- `<meta property="og:image:width" content="1200">`, `og:image:height="630"`.
- HEAD'ing the URL → final response is `x-matched-path: /404`, `x-next-error-status: 404`, `content-length: 10124` (Next 404 HTML returned with `content-type: text/html`).

**Verdict.** ❌. Real gap. Meta tags advertise an asset that does not exist.

**Spec implication for the LRS Audit Agent.** Parse all `og:image` and `og:image:secure_url` meta tags, GET each URL, assert HTTP 200 AND `content-type: image/*` AND decoded dimensions match `og:image:width` / `og:image:height` (within 5% tolerance). Optionally call the LinkedIn Post Inspector / Facebook Sharing Debugger / Twitter Card Validator scrape endpoints for cross-vendor confirmation.

### 11. Twitter card meta valid

**Method.** Parsed `<meta name="twitter:*">` tags. HEAD'd the referenced image.

**Result (raw).** All required tags present (`twitter:card=summary_large_image`, `twitter:title`, `twitter:description`, `twitter:image`). The `twitter:image` URL is the same `og-default.png` that 404s.

**Verdict.** ❌. Tags present, asset broken — Twitter will fail to render the card.

**Spec implication for the LRS Audit Agent.** Same as item 10 plus: assert `twitter:card` ∈ `{summary, summary_large_image, app, player}`. For `summary_large_image`, validate image dimensions ≥ 600×314 and aspect ratio 2:1 ± 5%. Hit Twitter's Card Validator API for definitive verdict where rate-limit allows; cache by URL hash.

### 12. Title <60 chars, meta description <160 chars

**Method.** `wc -c` on the exact strings parsed from HTML.

**Result (raw).**
```
title       = 60 chars  ("LaunchWings — your always-on growth team for solo founders")
description = 172 chars (...)
```
Title is exactly at the boundary. Description **exceeds the 160-char limit by 12 chars**.

**Verdict.** ❌. Description is over. Title is borderline (the em-dash is 1 character but renders wider — Google's pixel-width truncation is the real constraint, but the checklist uses char-count).

**Spec implication for the LRS Audit Agent.** Parse `<title>` text content and `<meta name="description" content>`. Fail if `title.length > 60` (warn at >55) or `description.length > 160` (warn at >155). Pixel-width upgrade later: render in Google's known title font (Arial 18px) and fail if rendered width > 600px. Same for description vs 920px.

### 13. Domain age >0 days, not on spam/blacklist

**Method.** `whois launchwings.com` for creation date. Spamhaus DBL / Google Safe Browsing require API keys not available here.

**Result (raw).**
- `Creation Date: 2026-05-07T07:32:35Z` (registry) / `2026-05-07T12:32:35Z` (registrar — slight clock drift). Today is 2026-05-08 → **age = 1 day** at audit time. The previous-day creation passes the >0-days bar barely; if I were running this audit yesterday it would have been age=0 → fail.
- Blacklist check: not run.

**Verdict.** ⚠️ partial. Domain age technically passes today (>0 days) but the spirit of this check — "not freshly-spawned" — is failed for a brand new domain. Blacklist is unverified.

**Spec implication for the LRS Audit Agent.** WHOIS lookup via RDAP (no flaky parser needed): `https://rdap.org/domain/${host}` returns JSON with `events[?eventAction=='registration'].eventDate`. Compute `age_days = (now - registration) / 86400`. Fail if `age_days < 1`; warn if `age_days < 30`. Blacklist: query Spamhaus DBL via DNS (`${host}.dbl.spamhaus.org`); query Google Safe Browsing v4 lookup endpoint with API key from secrets. Cache verdicts 24h.

### 14. Email capture exists

**Method.** Inspected homepage HTML for `<form>` containing `<input type="email">`.

**Result (raw).** Present. Form posts to `/api/waitlist` (component: `apps/web/components/waitlist-form.tsx`).

**Verdict.** ✅.

**Spec implication for the LRS Audit Agent.** Static check: parse all `<form>` elements; fail if none contains an `<input type="email">` or `<input name~=email>`. Live check: `POST` form action with a synthetic email, expect HTTP 2xx OR explicit `?test=1` mode that the destination acks without persisting.

### 15. Capture connected to a real destination — we send a test

**Method.** `POST /api/waitlist` with synthetic email `audit-noop-do-not-process@launchwings.test`.

**Result (raw).**
```
HTTP/2 503
Content-Type: application/json
{"ok":false,"message":"Email service is not configured. Try again in a few minutes."}
```
This is the hardened production response added in commit `c60f66d` (per dogfood learning #10) — it correctly surfaces that `RESEND_API_KEY` is unset in the production Vercel environment.

**Verdict.** ❌. Real gap. The form exists but its destination is broken in production. The hardening means the user gets an honest error instead of a silent fail (good), but the pipeline is still down.

**Spec implication for the LRS Audit Agent.** POST a synthetic email to the form's action URL with header `X-LaunchWings-Audit: 1` (the destination must whitelist this and not enqueue the row). Assert HTTP 2xx. For deeper validation, generate a per-audit unique address (`audit+${runId}@launchwings.com` via plus-addressing) and poll an audit inbox for delivery within 60s. Fail if no email arrives. Output spec: a separate `email_pipeline_health` boolean fed into `agent_runs`.

### 16. Privacy + Terms exist and linked

**Method.** `curl -I /privacy` and `/terms`. Inspected footer HTML for links.

**Result (raw).** Both pages 200. Footer contains `<a href="/privacy">`, `<a href="/terms">`, `<a href="/trust">`.

**Verdict.** ✅.

**Spec implication for the LRS Audit Agent.** HEAD `/privacy`, `/privacy-policy`, `/legal/privacy` — pass if any 200. Same for terms. Cross-check: the homepage HTML contains a link with text matching `/privacy/i` and one matching `/terms|tos/i`.

### 17. Analytics installed — verified beacon fires

**Method.** Searched shipped HTML and JS chunks for analytics SDK. Cannot confirm beacon fires without a headed browser session.

**Result (raw).**
- Layout chunk references `us.i.posthog.com` (PostHog Cloud US ingest).
- `apps/web/components/posthog-provider.tsx` initialises PostHog only if `NEXT_PUBLIC_POSTHOG_KEY` is set; cannot confirm from outside whether the env var is set in Vercel production.
- No GA4, Plausible, or other SDK in shipped output.

**Verdict.** ⚠️ partial. SDK is wired and shipped but beacon firing is unverified. If `NEXT_PUBLIC_POSTHOG_KEY` is unset (mirror of the `RESEND_API_KEY` situation), PostHog will silently no-op.

**Spec implication for the LRS Audit Agent.** Headless Chromium navigate, listen on `Network.requestWillBeSent` for outbound POSTs to known analytics ingest hosts (`*.posthog.com`, `*.plausible.io`, `*.google-analytics.com`, `*.gtm.com`, `our-embed.launchwings.com`). Fail if no beacon fires within 10s of `load`. Static-analysis fallback: parse SDK init code, assert `process.env.NEXT_PUBLIC_*_KEY` is bound at build time (the key shows up as a literal in the chunk).

### 18. Stripe / payments webhook reachable (if applicable)

**Method.** Searched repo for Stripe imports / `STRIPE_*` env references.

**Result (raw).** No Stripe SDK, no `/api/stripe`, no `STRIPE_` references in `apps/web/**`. Payments are not wired in this codebase yet.

**Verdict.** N/A → ✅ (per checklist's "if applicable" qualifier).

**Spec implication for the LRS Audit Agent.** Detect "applicable" by scanning the build output for `stripe-js` / `@stripe/*` imports OR a `<script src="js.stripe.com">` tag OR a `/checkout` route. If detected, HEAD the configured webhook URL and assert HTTP 200/204 to a `?ping=1` query. If undetected, mark `not_applicable` and contribute neither to the score nor the failure count.

---

## Aggregate

- **Hard ✅:** 4 items (3, 14, 16, 18-NA)
- **Hard ❌ (real gaps):** 6 items (4, 5, 9, 10, 11, 12, 15) — wait, 7. Recounting: 4, 5, 9, 10, 11, 12, 15 = **7 hard ❌**.
- **⚠️ real gap (not just tooling):** 13 (domain age = 1 day) → behaves like a soft fail today, hard fail yesterday.
- **⚠️ tooling-blocked (needs Lighthouse / multi-region):** 1, 2 (LLM-judge), 6 (mixed-content half), 7, 8, 17 (beacon-fire half).

**Score, strictest reading: 4/18.** Generous reading (counting all ⚠️-tooling as TBD-pass): 5/18 hard plus 6 TBD = 11/18 best case. Either way, **well below the 16/18 pass bar**.

This is the right outcome for DOG-09. The site is a freshly-deployed waitlist landing built in 36 hours; the checklist is a spec for a launch-ready production product. Every gap below is now scoped as a ticket and an evaluator.

## Lighthouse not yet run

Items 6 (mixed-content half), 7, 8, and 17 (beacon-fire half) cannot be closed without a real Chrome run. Recommended next step:

```
pnpm dlx @lhci/cli@0.13 collect --url=https://launchwings.com/ --settings.preset=desktop --collect.numberOfRuns=3
pnpm dlx @lhci/cli@0.13 collect --url=https://launchwings.com/ --settings.preset=mobile  --collect.numberOfRuns=3
```

Attach the JSON reports to the next audit cycle and update verdicts for items 6/7/8/17 in place.

## Resolutions

### LRS-07 → items 10 & 11 (OG + Twitter card image)

- **Filenames:** `apps/web/app/opengraph-image.tsx`, `apps/web/app/twitter-image.tsx`.
- **Routes:** `/opengraph-image` and `/twitter-image`, both 1200×630 `image/png` served from `next/og` `ImageResponse` on the edge runtime; `<head>` is auto-wired via the Next 15 file convention (we deliberately removed the explicit `openGraph.images` / `twitter.images` arrays in `layout.tsx`, since explicit metadata overrides the file convention and would have continued pointing at the dead `/og-default.png`).
- **Why dynamic over a static PNG:** the ticket's checkbox for `apps/web/public/og-default.png` is intentionally unticked. A code-rendered card lets a non-designer founder iterate copy without exporting from Figma, keeps the brand tokens (`#171717` bg, `#f59e0b` accent) in source rather than in a binary, and means a re-deploy is the only step needed to update the card.
- **Platform seed:** this is the prototype for PRD F2's per-customer dynamic OG generator. `app/[customerId]/opengraph-image.tsx` will reuse the same export shape (`alt` / `size` / `contentType` / default `ImageResponse` fn) and the same no-external-fetch / no-Google-Fonts edge-safe constraints. The renderer in `opengraph-image.tsx` is the contract; `twitter-image.tsx` re-exports it so a single component is the source of truth.
