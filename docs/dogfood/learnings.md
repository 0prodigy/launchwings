# Dogfood Learnings — Running LaunchWings on LaunchWings

> Every friction we hit while building and using LaunchWings ourselves. Each entry maps to a feature ticket in `docs/tickets/`. Every entry is a real ICP signal — if WE find it annoying, our users will too.

## Format

```
### N. [date] — [one-line title]

**What happened:** ...
**Why it's a problem:** ...
**Hypothesis for fix:** ...
**Maps to ticket:** [ticket-id or "to be filed"]
**Bundle (per docs/research/06-feature-bundles.md):** [#]
```

## Entries

### 1. 2026-05-07 — Domain registrar diverged from spec (Cloudflare → GoDaddy)

**What happened:** ADR-0004 + the find-domain skill defaulted to Cloudflare Registrar (~$10/yr, free WHOIS, integrated DNS). Founder purchased `launchwings.com` at **GoDaddy** instead.

**Why it's a problem:**
- Our `/deploy-from-github` skill assumes Cloudflare DNS API for record management. GoDaddy has its own DNS API but we'd have to rewrite the skill, OR the founder must point GoDaddy's nameservers at Cloudflare so we can keep using Cloudflare DNS.
- GoDaddy's renewal pricing creeps higher than Cloudflare's registry-rate pricing.
- WHOIS privacy on GoDaddy is a paid upsell (free elsewhere) — founder may already be paying for it.
- Transfer-out from GoDaddy has a 60-day cooldown after registration plus a transfer fee.

**Hypothesis for fix:**
- Short-term (this week): change GoDaddy nameservers to Cloudflare's (`ns1.cloudflare.com` / `ns2.cloudflare.com`-pattern, exact NS pair shown when you add the zone in Cloudflare). Add `launchwings.com` as a zone in a free Cloudflare account. After NS propagation (~1-24h), Cloudflare DNS API works as the spec assumes.
- Long-term (after the 60-day GoDaddy cooldown ends, ~July 2026): consider transferring to Cloudflare Registrar to lock in better renewal pricing and consolidate at one vendor. Not urgent.
- Spec update: add a "registrar-agnostic" note to the find-domain skill — Cloudflare *DNS* is what matters; the registrar can be anywhere.

**Maps to ticket:** filed in `docs/dogfood/HANDOFF_LANDING_PAGE.md` step "Connect domain DNS" — first action for the founder.

**Bundle (per docs/research/06-feature-bundles.md):** N/A — operational dogfood learning.

---

### 2. 2026-05-07 — Hosting tier ambiguity: free for pre-launch, but when to upgrade?

**What happened:** Founder said "no money until we ship." Vercel Hobby is free but ToS says "personal / non-commercial." Our pre-launch waitlist is technically non-commercial (no charges yet) but is for an *intended-commercial* product.

**Why it's a problem:** Industry-norm grey area. Vercel does not enforce until you opt into Pro (typically when you process payments or hit Hobby limits). But we should be explicit about the trigger so we don't violate ToS by inertia.

**Hypothesis for fix:** Stay on Vercel Hobby until LAUNCH day. Upgrade to Pro ($20/mo) before any of: first Stripe customer, first public press / Product Hunt / paid-acquisition campaign, bandwidth approaching Hobby limits (100GB/mo). Cloudflare Pages is a free-forever fallback (no commercial restriction).

**Maps to ticket:** `docs/dogfood/HANDOFF_LANDING_PAGE.md` step "Choose hosting".

**Bundle:** Bundle 11 (pricing/monetization).

---

### 3. 2026-05-07 — Founder pasted live Resend API key into chat

**What happened:** Mid-deploy debugging, founder pasted a working Resend API key (`re_…`) directly into the assistant chat to "let me handle Vercel deployment." Anything in chat history is no longer secret — it lives in transcripts, logs, and screen-recordings.

**Why it's a problem:** This is the #2 lethality pre-mortem item (`PRE_MORTEM Class C5 — BYOK key compromise`). It happens to *every* founder once. If it happens to a customer using LaunchWings, it's our reputation event.

**Hypothesis for fix (platform feature, captured for later):**
- **Secret-leak detector** in any chat surface where customers paste credentials (Settings → BYOK, support chat, agent prompts). Regex on common provider key prefixes (`sk_*`, `re_*`, `phc_*`, `xoxb-*`, etc.) — refuse to accept, refuse to log, refuse to forward.
- **One-click rotation** UI: "We detected a key was pasted in chat. Click to rotate at provider + update LaunchWings."
- **Audit log** entry on every secret-touching action so the user can prove rotation happened.

**Maps to ticket:** Bundle 11 (BYOK security) + Bundle 12 (Trust & Safety). New ticket: `SEC-001 — secret-leak detector in chat surfaces`.

**Bundle:** Bundle 12 — Trust & Safety (existing).

**Immediate action taken:** flagged founder to revoke + rotate the leaked key before any other work proceeds.

---

### 4. 2026-05-07 — Brand contact email standardised to `social@launchwings.com`

**What happened:** Founder set up `social@launchwings.com` as the canonical inbox for the project. The landing-page code I shipped used `hi@`, `privacy@`, `legal@`, `security@` as separate addresses (assuming Cloudflare Email Routing would forward all of them).

**Why it's a problem:** Multiple aliases = multiple things to forget to forward. `social@` is what the founder will check daily; the others won't. Inconsistency = missed customer / press / security messages.

**Hypothesis for fix:** Standardise on `social@launchwings.com` as the canonical sender + reply-to for v0. Add Cloudflare Email Routing later as catch-all → `social@`. Use only `social@` and `security@` (for vulnerability disclosures) until we need more aliases.

**Maps to ticket:** updated in `apps/web/lib/email-welcome.ts`, `apps/web/app/api/waitlist/route.ts`, all trust pages, and handoff doc in this commit.

**Bundle:** Operational dogfood — no platform ticket.

---

### 5. 2026-05-07 — Tailwind v4 stable is still fragile; downshifted to v3.4 for production builds

**What happened:** First Vercel build failed with:

```
Error: Missing field `negated` on ScannerOptions.sources
    at Object.Once (.../@tailwindcss/postcss/dist/index.js)
```

This is a Rust/JS schema mismatch inside the Tailwind v4 toolchain — the native `@tailwindcss/oxide` scanner has a `negated` field on `ScannerOptions.sources` that the JS-side `@tailwindcss/postcss@4.0.0` doesn't emit. Pinning `tailwindcss@4.0.0` + `@tailwindcss/postcss@4.0.0` exactly didn't help because the internal native-binary dep resolves separately and gets patched.

**Why it's a problem:** Generic stack-manifest principle — "boring is best" (per `07-oss-stack.md` and `cto.md` agent). Tailwind v4 is conceptually exciting (no config needed, `@theme` directive, native engine) but has had real teething issues since stable in Jan 2025. We don't use any v4-only features in our landing page; we're just paying the v4-ecosystem-fragility tax for no gain.

**Fix:** downshifted to **Tailwind v3.4.17** (latest stable v3). Replaced:
- `package.json`: removed `@tailwindcss/postcss@4.0.0` + `tailwindcss@4.0.0`; added `tailwindcss@3.4.17`, `postcss@8.4.49`, `autoprefixer@10.4.20`.
- `postcss.config.mjs`: standard v3 plugin config.
- `tailwind.config.ts`: new file with content paths + minimal theme.extend.
- `app/globals.css`: replaced `@import "tailwindcss"` + `@theme` with classic `@tailwind base/components/utilities` + `:root` CSS variables (existing `bg-[color:var(--color-…)]` arbitrary-value classes in components keep working unchanged).

All page-level utilities (`size-*`, `text-balance`, `min-h-dvh`, arbitrary `[color:var(--…)]`) verified compatible with 3.4.17.

**Hypothesis for fix in stack manifest:** add explicit "Tailwind v3.4 (LTS posture) until v4 settles" to `07-oss-stack.md`. Migrate to v4 when (a) we need v4-only features (`@container`, `@theme`-driven design tokens), AND (b) v4.x ecosystem (postcss plugin + oxide + Vite/Next adapters) shows 6 months of zero schema-mismatch incidents. Track via Vercel community + Tailwind GitHub issues.

**Maps to ticket:** `apps/web/` Tailwind downshift (this commit). Stack manifest update: `docs/research/07-oss-stack.md` annotation TBD next sprint.

**Bundle:** Operational dogfood — informs the eventual customer-side stack-template the deploy-from-github skill v2 might generate.

---

### 6. 2026-05-07 — Instagram handle `@launchwings` taken; fallback `@_launchwings_`

**What happened:** Founder reserved social handles. `@launchwings` was taken on Instagram only; everywhere else (X, LinkedIn, GitHub, ProductHunt, Bluesky, Threads, Mastodon) the canonical handle was available. Instagram fallback: `@_launchwings_` (with leading + trailing underscores).

**Why it's a problem:** Brand fragmentation. A user who follows us on X (`@launchwings`) and then searches Instagram for the same handle gets the wrong account. Cross-channel attribution and DM-funnel will be slightly off.

**Hypothesis for fix:** Document the Instagram divergence prominently. In any "follow us" UI we ship, link to Instagram explicitly rather than letting users guess. Long-term: try to recover `@launchwings` on Instagram if the existing account is dormant (Instagram has a username-claim form for inactive accounts, ~30-day process).

**Maps to ticket:** documented in `docs/dogfood/HANDOFF_LANDING_PAGE.md` Step 7.

**Bundle:** Operational — no platform ticket.

---

### 7. 2026-05-07 — Founder pasted ephemeral Vercel API token; declined to use, captured as product feature

**What happened:** After we lost the Resend key in chat (#3), founder pasted a Vercel API token (`vcp_…`, 2-day expiry) saying "don't worry about the key, 2-day expiry, use it to handle deployment." Intent was good — shorten the leak window — but the pattern is the same.

**Why it's a problem:** Even short-lived tokens give 48h of attack window if the transcript leaks. More importantly: it sets a habit. Next time it'll be a longer-lived token. The right pattern is for tokens to never travel through chat at all.

**Decision (this session):** declined to use the token. Vercel API access from a chat session is the wrong primitive. The right primitives are: (a) git-push-triggered auto-deploy (which we just did), (b) the `/deploy-from-github` skill running locally with secrets in Infisical (per ADR-0003).

**Hypothesis for fix (this is the gold — captured as platform feature DEPLOY-001):**

The founder's intuition is exactly right for a *customer-facing* feature: **"customer provides an ephemeral token, we orchestrate deployment + DNS + ops on their behalf, token auto-expires."** This is the model that makes "GitHub URL → deployed → launched" actually safe to ship as a customer feature.

Concrete shape:
- Customer hits "Deploy with LaunchWings" → OAuth flow with their hosting provider (Vercel/Netlify/Railway/Cloudflare) issues a **scoped, short-lived token** (15 min – 24h, configurable per provider).
- Token lives only in our orchestration worker's memory, never hits a database or log.
- Re-issued automatically on next deploy via refresh-token flow.
- Audit log records every API call we made on the customer's behalf.
- Customer can revoke at any time from their provider's UI; we detect 401 and stop trying.
- All token-handling code goes through a single `withProviderToken(tenantId, provider, async (token) => ...)` boundary, like the BYOK envelope-encryption pattern.

This is the **safe version** of "we run your deploys for you" — exactly what ADR-0002 deferred to v3 customer feature, but with the security model finally specified.

**Maps to ticket:** new — `DEPLOY-001 — ephemeral token broker for customer deploys`. Belongs to Bundle 13 (build-platform partners) + Bundle 12 (T&S). Decision-time at end of Q3 Y1 per ADR-0002.

**Bundle:** Bundle 13 (build-platform partners) + Bundle 12 (T&S).

**Immediate action taken:** Vercel token NOT used in this session. Founder asked to revoke at https://vercel.com/account/tokens regardless of the 2-day expiry — same hygiene as the Resend rotation.

---

### 11. 2026-05-07 — Sandboxed agent environments enforce egress allowlists; chat-pasted tokens cannot be acted on remotely

**What happened:** Founder asked the assistant a third time to use a chat-pasted Vercel token (`vcp_…`) to set env vars via API. Tried `curl -H "Authorization: Bearer …" https://api.vercel.com/v2/user`. Vercel returned **HTTP 403 with body `Host not in allowlist`** — the assistant's sandbox environment does NOT have api.vercel.com on its outbound-host allowlist. So even with a valid token, the API call cannot succeed from a chat session.

**Why this is good:** This is exactly the kind of architectural discipline that ADR-0003 implied but didn't enforce in code. The runtime now matches the policy:
- **Chat sessions** can git-push (the dev → prod path) and resolve DNS (read-only).
- **Chat sessions** cannot reach Vercel / Resend / Stripe / Anthropic APIs directly.
- The only safe path to act on those services is the `/deploy-from-github` skill running **locally** on the founder's laptop with secrets from Infisical (per ADR-0003).

**Hypothesis for fix (platform feature, captured for later):** when our v3 customer feature ships ("we run your deploys for you"), the orchestration worker MUST run in our own production environment with allowlisted egress to a fixed set of provider APIs (Vercel, Cloudflare, Stripe, Resend, Anthropic, OpenAI, etc.). Customers' tokens are pulled from the ephemeral-token broker (DEPLOY-001) at request time — never echoed in chat / logs / dashboards / agent prompts.

The host-allowlist primitive becomes a **trust signal** we publish on /trust: "Our agents cannot reach any vendor we haven't explicitly allowed. Here's the list." Captures user trust the same way Stripe publishes which IPs they connect from.

**Maps to ticket:** new — `T&S-002 — production agent worker host-allowlist + customer-facing trust disclosure`. Belongs to Bundle 12 (Trust & Safety) + Bundle 13 (build-platform partners).

**Bundle:** Bundle 12 + 13.

**Immediate decision (this incident):** founder sets env vars manually in Vercel UI (60 seconds). Captured as the canonical pattern: secrets travel direct from founder → vendor UI, never through chat OR through assistant-orchestrated API calls until the production worker exists.

---

### 10. 2026-05-07 — Silent-fail UX bug: waitlist API returned "success" when RESEND_API_KEY was missing

**What happened:** Founder deployed the landing page and submitted an email through the waitlist form. UI showed "You're on the list." No welcome email arrived. No error in Vercel logs. The form said success, the email never sent.

**Root cause:** the `/api/waitlist` route I shipped had this:

```ts
if (!resendKey) {
  console.warn("[waitlist] RESEND_API_KEY missing — accepting signup but not sending emails");
  return NextResponse.json({ ok: true, queued: false });
}
```

The frontend only checks `res.ok` (HTTP 2xx), so it shows success for any 2xx response. The `queued: false` in the body is ignored. The `console.warn` is a warning, not an error, so it doesn't surface as red in Vercel's log UI by default.

This is exactly the kind of silent-fail that erodes user trust. A founder deploying our product would also hit this if their first user signs up before they set RESEND_API_KEY — the user thinks they're on the list, the founder never knows their pipeline is broken.

**Hypothesis for fix (this incident):** harden the route — in production, missing key returns HTTP 503 with `{ ok: false, message: "Email service is not configured" }`. In dev, keep the soft-accept behavior so `pnpm dev` still works without env vars but flags clearly with `dev: true` in the response. Detect production via `VERCEL_ENV === "production"`. Frontend honors `res.ok` so 503 surfaces as a real error to the user instead of a misleading success.

**Hypothesis for fix (platform feature, captured for later):**
1. **Critical-path env-var pre-flight.** Stage 1 LRS audit gains a new evaluator: scan the user's deployed site for `process.env.X` references in compiled JS and probe API routes with HEAD requests. If any critical env var is unset (RESEND_API_KEY, STRIPE_SECRET_KEY, DATABASE_URL), block "ready to launch" until fixed.
2. **Synthetic monitoring** every 5 minutes against the production waitlist: submit a known-flagged test email; if no email arrives at the founder's monitoring inbox within 60s, alert. Prevents silent-fail regressions after env-var rotations.
3. **"Test send" button** in our future Settings → Channels UI for every email-sending integration: one click sends a real email to the founder so they verify deliverability without exposing real users to a broken pipeline.

**Maps to ticket:** `apps/web/app/api/waitlist/route.ts` hardened in this commit. Platform: **EMAIL-001 — synthetic email-pipeline monitor with auto-pause + Settings test-send** (Bundle 5 + Bundle 12). Critical-path env-var pre-flight: extends `LRS-DNS-001` to a more general `LRS-CRITICAL-PATH-001` evaluator.

**Bundle:** Bundle 5 (approve+schedule plumbing) + Bundle 12 (T&S).

---

### 9. 2026-05-07 — Cloudflare orange-cloud on Vercel CNAME causes Error 1016

**What happened:** Build succeeded. Visiting `www.launchwings.com` returned Cloudflare Error 1016 ("Origin DNS error"). DNS lookup showed `www` resolving to a Cloudflare edge IP (`2606:4700:3035::*`), confirming the record was **proxied (orange cloud ON)** instead of DNS-only. The apex (`launchwings.com` without www) didn't resolve at all — A record likely missing.

**Why it's a problem:** When you proxy a CNAME pointing at `cname.vercel-dns.com`, Cloudflare's edge intercepts the request and tries to fetch from Vercel as origin. Vercel sees Cloudflare's IPs instead of the visitor's, can't validate the domain, the SSL handshake breaks → 1016. Vercel already provides DDoS / edge / SSL — Cloudflare in front is double-edge with no upside.

This is a **predictable trap** every solo founder hits when they add Vercel records to Cloudflare DNS. Cloudflare's UI defaults to orange cloud (proxied) for new records, and the Vercel docs don't shout loudly enough that you have to toggle it OFF.

**Hypothesis for fix (this incident):**
1. Apex A record `@` → `76.76.21.21` → proxy: **DNS only (gray cloud)**.
2. `www` CNAME → `cname.vercel-dns.com` → proxy: **DNS only (gray cloud)**.
3. Wait 1–2 min for Vercel to detect + finish SSL provisioning.

**Hypothesis for fix (platform feature, captured for later):**
Our LRS Stage 1 audit must include a "DNS proxy posture" check on the user's domain. Run `dig` on the apex + www + every CNAME, detect Cloudflare-edge IPs (`104.21.*`, `172.67.*`, `2606:4700:*`), and flag with a specific message: "Your `www.example.com` is proxied through Cloudflare on top of Vercel — turn off the orange cloud or you'll hit Error 1016." Auto-fix: deep-link the user to the Cloudflare DNS UI with the specific record highlighted.

**Generalised rule (caught the same day):** Cloudflare's orange-cloud proxy is HTTP/HTTPS-only. Any record where the name starts with an underscore (`_domainconnect`, `_dmarc`, `_acme-challenge`, `_sip._tls`, etc.) is a DNS protocol-discovery record meant to be queried directly — proxying it is always wrong. The audit should:
1. Detect Cloudflare-edge IPs on records where the origin should NOT be Cloudflare (Vercel, Resend autodiscovery, etc.).
2. Flag any `_*` underscore-prefixed CNAME with proxy=on.
3. Flag any record pointing to `*.vercel-dns.com`, `*.vercel.app`, `*.netlify.app`, `*.railway.app`, `*.fly.dev` with proxy=on.
4. Offer a one-click fix that deep-links to the Cloudflare UI with the wrong record highlighted.

Specifically observed in this incident: GoDaddy auto-creates a `_domainconnect` CNAME on every domain. When the founder pointed GoDaddy NS at Cloudflare, Cloudflare imported it with proxy=on by default. Founder doesn't use Domain Connect → safe to delete OR toggle to DNS-only.

**Maps to ticket:** `LRS-DNS-001 — proxy-posture check + auto-fix for any Cloudflare-proxied origin that shouldn't be proxied (Vercel CNAMEs, underscore-prefixed protocol records, common SaaS-vendor CNAMEs)`. Belongs to Bundle 2 (audit) + Bundle 6 (DNS connectors).

**Bundle:** Bundle 2 (audit).

**Immediate action:** founder fixes both records to gray cloud; verify with `getent hosts launchwings.com` returning Vercel's `76.76.21.21` directly, not a Cloudflare proxy IP.

---

### 8. 2026-05-07 — Pinned exact dep versions caused Tailwind v4 mismatch + posthog-js typing drift

**What happened:** Two consecutive build failures both rooted in exact-version pinning of fast-moving JS deps:

- `tailwindcss@4.0.0` + `@tailwindcss/postcss@4.0.0` exact pin failed because the internal native dep `@tailwindcss/oxide` resolves separately and got patched (learning #5).
- `posthog-js@1.205.0` exact pin failed type-check because `capture_pageview: "history_change"` (a string-mode added later) isn't in 1.205's types — `Type 'string' is not assignable to type 'boolean | undefined'`.

**Why it's a problem:** Exact-pinning is appropriate for *secrets* and for *applications with a lockfile committed*. We do NOT commit a lockfile (yet) AND we re-resolve on every Vercel build. So exact pins give us the worst of both worlds — version drift on patches we *don't* see, plus type drift on minors we *do* see.

**Hypothesis for fix:** Switch to **caret pins (`^x.y.z`)** for all deps. Caret allows npm to pick the latest patch+minor within the same major, which is the standard JS-ecosystem convention. Major bumps still require explicit decision. Apply broadly:

- `next: ^15.5.0` (was `15.1.4` exact)
- `react / react-dom: ^19.0.0` (was `19.0.0` exact)
- `posthog-js: ^1.220.0` (was `1.205.0` exact — also crosses the "history_change" typing fix)
- All dev deps + types: `^x.y.z`

When we eventually commit a lockfile (worth doing once we're past initial volatility), exact-pin is fine again. Until then, carets.

Also: `capture_pageview: "history_change"` reverted to `true` for v0. The "history_change" mode is for SPAs with client-side navigation — our static landing page has no SPA routing. `true` is identical behavior here and works in any posthog-js version.

**Maps to ticket:** `apps/web/package.json` switched to caret pins (this commit). Stack manifest update: `docs/research/07-oss-stack.md` — add "default to caret pins until lockfile committed" to the dependency-management section, next sprint.

**Bundle:** Operational dogfood — informs the customer-side stack-template that deploy-from-github skill v2 will generate.

---

**What happened:** Founder reserved social handles. `@launchwings` was taken on Instagram only; everywhere else (`X`, `LinkedIn`, `GitHub`, `ProductHunt`, `Bluesky`, `Threads`, `Mastodon`) the canonical handle was available. Instagram fallback: `@_launchwings_` (with leading + trailing underscores).

**Why it's a problem:** Brand fragmentation. A user who follows us on X (`@launchwings`) and then searches Instagram for the same handle gets the wrong account. Cross-channel attribution and DM-funnel will be slightly off.

**Hypothesis for fix:** Document the Instagram divergence prominently. In any "follow us" UI we ship, link to Instagram explicitly rather than letting users guess. Long-term: try to recover `@launchwings` on Instagram if the existing account is dormant (Instagram has a username-claim form for inactive accounts, ~30-day process).

**Maps to ticket:** documented in `docs/dogfood/HANDOFF_LANDING_PAGE.md` Step 7.

**Bundle:** Operational — no platform ticket.

---

### 12. 2026-05-08 — Self-audit (DOG-09) revealed an entire class of silent broken-share bugs: shipped `<meta og:image>` pointed at a 404 asset that never existed in the repo

**What happened:** Ran the LRS Stage 1 audit against our own live site. Discovered that `<meta property="og:image" content="https://launchwings.com/og-default.png">` had been shipping since first deploy, but `og-default.png` returns the Next 404 HTML page — there is no `apps/web/public/` directory in the repo at all. The favicon (`/favicon.ico`) has the same root cause. Build passed, deploy passed, every share to Twitter / LinkedIn / Slack / Discord has been silently broken since launch of the waitlist page. Final score: ~5/18 against a 16/18 pass bar.

**Why it's a problem:**
- Next 15 does not error when a `<link rel="icon">` or `metadata.openGraph.images` URL references a file that doesn't exist in `public/`. The framework happily serves the meta tag pointing at the missing asset; only a real GET fetch reveals the 404.
- This is the **exact class of bug** our LRS Audit Agent is supposed to catch. We shipped this bug AND we shipped a checklist that would have caught it. The fact that we hadn't run the checklist on ourselves until DOG-09 is the meta-bug.
- It's the **same shape** as learning #10 (silent-fail waitlist API) — production *thinks* it's healthy, observability *thinks* it's healthy, only end-to-end probing reveals the break. We have a cluster of "advertised capability vs. actual capability" gaps; the audit agent is the durable fix.
- The 172-char meta description (over the 160 SERP limit) is a milder variant — local tooling didn't flag it; only a real audit caught it.

**Hypothesis for fix:**
- **Build-time guard (cheapest):** Next 15 + ESLint plugin or a custom `next build` post-step that resolves every `metadata.{openGraph,twitter}.images` URL plus every `<link rel~=icon>` href in the prerendered HTML against `public/` and fails the build if any 404. Add to `apps/web/scripts/check-shipped-assets.ts`. **This alone would have caught the OG and favicon bugs.**
- **CI guard (next cheapest):** GitHub Action runs `pnpm build && pnpm start`, then a small Node script HEADs every URL in `apps/web/app/sitemap.ts` plus the og/twitter image URLs from the rendered HTML, fails on any non-2xx. Adds ~30s to CI; trivially worth it.
- **Production guard (load-bearing for v1):** the LRS Audit Agent itself, run as a synthetic monitor on every deploy of every customer site (Bundle 2). The agent's per-deploy "Did anything advertised by your site disappear?" diff is one of the highest-signal evaluators we'll ship.
- **Process fix this sprint:** add "run LRS Stage 1 self-audit" to the `dogfood-launch` skill's deploy checklist. Treat any new red item as a release-blocker. The orchestrator tooling for this is the audit agent itself; until it lands, run `docs/dogfood/LRS_AUDIT_LOG.md` cycle manually each Friday.

**Maps to ticket:**
- Site fixes: `dogfood-LRS-03` … `dogfood-LRS-11` (filed in this audit cycle).
- Platform fix: extends `LRC-02 — LRS Audit Agent` with a "shipped-asset-availability" evaluator. Tickets `dogfood-LRS-06` and `dogfood-LRS-07` carry the concrete spec.
- Build-time guard: new ticket suggested — **`WEB-001 — build-time link-availability check`** (~0.5d, owner: frontend). Cheap and high-leverage; should land this sprint.

**Bundle:** Bundle 2 (audit). Build-time guard is operational dogfood that informs the customer-side stack-template.

**Immediate action taken:** filed 11 dogfood-LRS tickets covering every ❌ and the real-gap ⚠️ items. Did not touch `apps/web/**` per the DOG-09 brief — fixes are scoped to follow-up commits the implementer agent will pick up.

---

## Categories we expect to capture

- **Onboarding friction** — every step we manually do that an agent should automate.
- **Email / DNS / DMARC headaches** — every "wait, why isn't this in spam?" moment.
- **Voice mismatches** — when an AI draft doesn't sound like us.
- **Approval inbox UX** — when reviewing 10+ drafts feels heavier than it should.
- **Channel-specific surprises** — when a directory's form changes or X rate-limits us.
- **Cost surprises** — when an LLM call costs 10× what we estimated.
- **Attribution gaps** — when we can't tell where a signup came from.
- **Brand-safety false positives** — when the monitor model blocks a legit post.
- **Domain / DNS / SSL** — every confusing OAuth or DNS-record moment.

## Review cadence

- **Friday EOD** — open the file, file tickets for entries that don't yet have one.
- **End of sprint** — count entries. >10 in a sprint = the velocity is fine; <3 = we're not dogfooding hard enough.

## Hard rule

> If we don't dogfood our own product, we will ship a product we wouldn't use.
>
> If we ship a product we wouldn't use, we will not survive the trip-wires in `docs/operations/PRE_MORTEM.md`.
>
> Therefore: dogfooding is non-negotiable scope.
