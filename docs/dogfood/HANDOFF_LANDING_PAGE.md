# Handoff — Ship the LaunchWings Landing Page

> ## ✅ SHIPPED 2026-05-07
>
> launchwings.com is live with valid SSL. Build green. Form submits successfully. Resend env wiring is the last thing pending — see `HANDOFF_NEXT_PHASE.md` for what's next.
>
> This document is preserved as the historical record of the first deploy. **Do not follow these steps again** — the platform is up. Refer to `HANDOFF_NEXT_PHASE.md` for the current runbook.

## ⚠️ SECURITY INCIDENT (2026-05-07) — read first

A live Resend API key was pasted into the assistant chat. Treat anything pasted in chat as **public**.

**Recovery (do this before any other work):**
1. Open https://resend.com/api-keys → click the leaked key → **Revoke**.
2. **Create new** → copy the new key.
3. **Vercel** → Project Settings → Environment Variables → update `RESEND_API_KEY` with the new value → click **Save**.
4. **Redeploy** the latest production build (Vercel → Deployments → ⋯ → Redeploy).

**Going forward:**
- Never paste secrets in chat / Slack / Discord / docs / commits / screenshots.
- Always paste straight into the destination (Vercel env vars, Infisical, registrar UI).
- Captured as `learnings.md #3` — becomes platform feature SEC-001 (secret-leak detector in chat surfaces).

## ⚠️ MOST LIKELY VERCEL BUILD FIX (do this before debugging anything else)

Symptoms vary, but if the build fails with "no Next.js project found" / "build command failed" / "couldn't detect framework," the cause is almost always:

**Vercel project Root Directory is unset (defaults to repo root, where there's no Next.js app).**

**Fix:**
1. Vercel → Project (`prj_7BKis…`) → **Settings** → **General** → **Root Directory**.
2. Click **Edit** → enter `apps/web` → **Save**.
3. **Deployments** → ⋯ → **Redeploy**.

If the build still fails, send me the exact stderr from Vercel → Deployments → click the failed deploy → "Build Logs" tab — paste the lines starting from the first red `Error:` or `Failed`.

This is your runbook. Each section says **what's already done**, **what you do**, and **how to verify**. Mark ☑ as you go — file blockers in `docs/dogfood/learnings.md` or message me.

## What I already built (in this commit)

- `apps/web/` — Next.js 15 + Tailwind v4 + TypeScript marketing site
- Hero + 3-feature section + accessible waitlist form
- `/api/waitlist` POST handler: validates email, verifies Turnstile, sends Resend welcome email + founder notification
- `/privacy`, `/terms`, `/trust` stub pages (drafts good enough for waitlist period)
- `app/robots.ts` + `app/sitemap.ts` for SEO basics
- PostHog analytics provider (loads only when key is set)
- Open Graph + Twitter card metadata, theming via Tailwind v4 + a warm-amber "wings" accent
- All env-var dependencies are **optional** for `pnpm dev` — the site runs locally with placeholder behavior

You don't need to write or paste any code unless I ask.

---

## Step 0 — Local sanity check (5 min) — *recommended*

Before any deploy, prove the code runs on your laptop.

```bash
cd apps/web
cp .env.local.example .env.local      # leave values empty for now
pnpm install                           # ~30s on a warm cache
pnpm dev                               # opens on http://localhost:3000
```

**Verify:**
- ☐ Homepage renders at `http://localhost:3000` (dark theme, hero, waitlist form, 3 features, footer).
- ☐ `/privacy`, `/terms`, `/trust` render without 404.
- ☐ Submitting a fake email in the form returns "You're on the list" (server logs `RESEND_API_KEY missing` because env vars are empty — that's expected).

**If `pnpm` isn't installed:** `npm install -g pnpm`. Or use `npm install` / `npm run dev` instead.

**Blocker handoffs:**
- Build error on Tailwind v4 → tell me, I'll downshift to v3.4.
- Type errors → run `pnpm type-check` and paste the output.

---

## Step 1 — Point GoDaddy DNS at Cloudflare (10 min)

You bought `launchwings.com` at GoDaddy. Our deploy automation expects Cloudflare DNS. Cleanest fix: keep the domain at GoDaddy as registrar, point its name servers at Cloudflare, manage records via Cloudflare. (Don't transfer — there's a 60-day cooldown after registration.)

1. **Create a free Cloudflare account** at https://dash.cloudflare.com (if you don't already have one).
2. Click **Add a domain** → enter `launchwings.com` → pick the **Free** plan.
3. Cloudflare scans existing records (will be GoDaddy's defaults). Don't worry about them yet.
4. Cloudflare shows you **two assigned name servers** like `lia.ns.cloudflare.com` + `kurt.ns.cloudflare.com` (your pair will differ). **Copy them.**
5. In GoDaddy: **My Products → Domains → launchwings.com → DNS → Nameservers → Change** → choose **Custom** → paste the two Cloudflare NS values → save.
6. Back in Cloudflare, click **Done, check nameservers**. Propagation is usually 10 min – 24 h.
7. While you wait: in Cloudflare, set **SSL/TLS mode = Full (strict)** (default is fine). Leave the orange-cloud toggle **OFF** for the records we'll add in Step 4 — Vercel needs to validate ownership directly.

**Verify:**
- ☐ Cloudflare zone status reads **Active** (could take a few hours; check back).
- ☐ `dig NS launchwings.com +short` returns Cloudflare nameservers (run from your laptop terminal).

**Blocker handoffs:**
- GoDaddy locks NS changes pending verification email → check email + click the link.
- Propagation hangs >24h → message me, I'll help debug.

---

## Step 2 — Create the third-party accounts (15 min, parallel-friendly)

You need free accounts for four services. Create them now; we'll wire keys in Step 5.

| Service | URL | What for | Free tier limit |
|---|---|---|---|
| **Vercel** | https://vercel.com/signup | Hosting | Hobby: 100GB bw/mo, 100K function invocations |
| **Resend** | https://resend.com/signup | Welcome emails | 3,000/mo, 100/day |
| **PostHog Cloud (US)** | https://app.posthog.com/signup | Analytics | 1M events/mo |
| **Cloudflare Turnstile** | already in your CF dashboard → **Turnstile** | Anti-bot | Unlimited |

**During signup:**
- ☐ Vercel: connect your **GitHub** account (you'll deploy by linking the repo).
- ☐ Resend: add `launchwings.com` as a domain (we'll verify it in Step 4).
- ☐ PostHog: create a project named `launchwings-web` in **US Cloud** (matches the env var default).
- ☐ Turnstile: **Add site** → name `launchwings-web` → domain `launchwings.com` (and add `localhost` to the dev list) → Widget mode **Managed**.

**Save the keys** (don't paste them anywhere yet — we wire them in Vercel in Step 5):
- ☐ Resend API key (`re_…`) — only shown once at creation.
- ☐ PostHog **Project API Key** (starts `phc_…`) — Project settings → API key.
- ☐ Turnstile **Site key** (public) and **Secret key** (private).

**Blocker handoffs:**
- Resend email verification fails → screenshot the error, I'll diagnose DKIM.
- Turnstile rejects `launchwings.com` for "domain unverified" → it doesn't actually need to verify, just save the site.

---

## Step 3 — Push the repo to GitHub (5 min)

If you haven't already:

```bash
# from /home/user/dot (repo root)
git push -u origin claude/solopreneur-launch-platform-PcSNn
```

Vercel needs the repo on GitHub to wire git-integration deploys. The current branch is `claude/solopreneur-launch-platform-PcSNn` — we'll either deploy from this branch or merge to `main` first (your call).

**Verify:**
- ☐ `https://github.com/0prodigy/dot/tree/claude/solopreneur-launch-platform-PcSNn` shows the latest commit including `apps/web/`.

---

## Step 4 — First Vercel deploy + custom domain (15 min)

1. **vercel.com → Add New… → Project** → import `0prodigy/dot`.
2. **Root directory**: click "Edit" → set to `apps/web` (this is the monorepo subdirectory).
3. **Framework preset**: Next.js (auto-detected).
4. **Production branch**: `claude/solopreneur-launch-platform-PcSNn` for now (change to `main` later when we merge).
5. **Don't add env vars yet** — click **Deploy** with the defaults. The build should succeed even without env vars; you'll see "RESEND_API_KEY missing" warnings in runtime logs.
6. After the build goes green: **Settings → Domains → Add → launchwings.com**. Vercel shows you DNS records to add at Cloudflare.
7. **In Cloudflare DNS** (NS-pointed there from Step 1):
   - Add record **A** | name `@` | value `76.76.21.21` | proxy status **DNS only** (gray cloud).
   - Add record **CNAME** | name `www` | value `cname.vercel-dns.com` | proxy status **DNS only**.
   - Save both.
8. **Back in Vercel**: click "Refresh" — it verifies DNS, requests a Let's Encrypt cert. Takes 30s – 2 min.
9. **Visit** `https://launchwings.com` — should load the homepage with valid SSL.

**Verify:**
- ☐ `https://launchwings.com` returns 200 with valid SSL (check the padlock).
- ☐ `https://www.launchwings.com` redirects to apex (Vercel does this by default).
- ☐ View source → meta tags include `og:image`, `twitter:card`.

**Blocker handoffs:**
- Vercel says "Domain is already in use" → it's on another Vercel project; release it from there first.
- "DNS verification failed" after 5 min → confirm Cloudflare proxy is **gray cloud (off)**. Orange-cloud breaks Vercel domain verification.

---

## Step 5 — Wire env vars + redeploy (10 min)

Now add the keys you collected in Step 2.

In Vercel: **Settings → Environment Variables**. Add all of these for **Production + Preview + Development**:

| Key | Value | Required? | Type |
|---|---|---|---|
| `RESEND_API_KEY` | NEW key from Resend (post-rotation) | **Yes** | Encrypted |
| `RESEND_FROM` | `social@launchwings.com` | Yes | Plain |
| `FOUNDER_EMAIL` | `social@launchwings.com` (or your personal inbox) | Yes | Plain |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | `0xAAAA…` (Turnstile site key) | Optional — code skips Turnstile if missing | Plain |
| `TURNSTILE_SECRET_KEY` | `0xAAAA…` (Turnstile secret key) | Optional — pair with site key | Encrypted |
| `NEXT_PUBLIC_POSTHOG_KEY` | `phc_…` | Optional — analytics no-op without it | Plain |
| `NEXT_PUBLIC_POSTHOG_HOST` | `https://us.i.posthog.com` | Optional | Plain |

**You only have Resend right now — that's enough to ship.** The form will still capture and email-confirm signups; PostHog and Turnstile can be wired later.

Then **Deployments → … → Redeploy** the latest production deploy.

**Verify:**
- ☐ Visit `https://launchwings.com`, open DevTools → Network → submit your own email.
- ☐ Response is `{ ok: true, queued: true }`.
- ☐ Welcome email arrives in your inbox (check spam, especially before DKIM verifies).
- ☐ Founder-notification email arrives at `FOUNDER_EMAIL`.
- ☐ Open Posthog dashboard → **Live events** → see `$pageview` and `waitlist_signup` events.
- ☐ Turnstile widget renders below the form (small dark Cloudflare badge).

**Resend domain verification (separate task):**
- ☐ Resend dashboard → **Domains → launchwings.com** → it shows DNS records (DKIM, SPF, DMARC) to add at Cloudflare. Add them. Status changes to **Verified** within ~5 min.
- ☐ Until verified, Resend sends from a Resend-owned default domain (still works, but inbox-placement is worse). Verifying improves deliverability dramatically.

**Blocker handoffs:**
- 500 error on form submit → check Vercel runtime logs (Project → Logs).
- Welcome email lands in spam → wait until Resend domain is verified, then re-send a test.
- PostHog event doesn't appear → check the project key is correct + the key starts with `phc_`.

---

## Step 6 — Run our own LRS Stage 1 audit (15 min) — DOG-09

This is dogfooding the readiness checklist. You're running our own checklist against our own site. Whatever fails IS a real bug we ship to fix in the platform.

Open `docs/product/LAUNCH_READINESS_CHECKLIST.md` Stage 1. For each of the 18 items, mark ☑ pass / ⚠ partial / ❌ fail in a new file at `docs/dogfood/LRS_AUDIT_LOG.md`.

Items I expect to fail on first audit (capture these as learnings):
- **OG image** is a placeholder reference; you need to generate a real `public/og-default.png` (1200×630). Use Fal.ai (Flux Dev, ~$0.025) or any tool. Add it to `apps/web/public/`.
- **Demo video / interactive demo** — we don't have one; audit will flag.
- **About / founder section** — not on the homepage; consider adding to `/trust` or a separate page.
- **Logo / favicon ≥256px** — add `apps/web/public/favicon.ico` + `apps/web/public/icon.png`.

Each failure → an entry in `docs/dogfood/learnings.md` → a ticket against the platform.

**Verify:**
- ☐ LRS Stage 1 score documented in `docs/dogfood/LRS_AUDIT_LOG.md`.
- ☐ Lighthouse run (Chrome DevTools → Lighthouse → mobile, prod URL) — perf ≥85, SEO ≥95, a11y ≥95.

---

## Step 7 — Reserve social handles (10 min, do this TODAY)

Handles disappear faster than domains. Same day as the deploy:

**Status as of 2026-05-07:** founder reported handles secured. Most platforms got `@launchwings`; Instagram fallback is `@_launchwings_` (canonical was taken).

| Platform | Handle | Status |
|---|---|---|
| X (Twitter) | `@launchwings` | claimed |
| LinkedIn (company page) | `launchwings` | claimed |
| GitHub org | `launchwings` | claimed |
| ProductHunt | `launchwings` | claimed |
| Bluesky | `launchwings.bsky.social` | claimed |
| Threads | `@launchwings` (or auto-tied to IG) | claimed |
| Mastodon | `@launchwings` | claimed |
| **Instagram** | **`@_launchwings_`** ⚠️ | claimed (canonical taken) |

**Instagram divergence is captured as `learnings.md #5`.** In any "follow us" UI we ship, link to Instagram explicitly rather than letting users guess at the handle. Long-term we may file an Instagram username-claim form for the inactive `@launchwings` account (~30-day process).

**Verify:**
- ☐ All seven platforms show `@launchwings` (or closest equivalent if taken — drop a learning entry if so).
- ☐ Add the 3 most-used (X, LinkedIn, GitHub) to the site footer in a follow-up commit.

---

## Step 8 — Verify the email path end-to-end (5 min)

Once Resend domain is verified (Step 5):

- ☐ Submit your real email through the live form.
- ☐ Welcome email lands in inbox (NOT spam) within 30 seconds.
- ☐ Founder-notification email lands at `FOUNDER_EMAIL`.
- ☐ Reply to the welcome email with "test" — it goes to `hi@launchwings.com`. Set up forwarding from there to your inbox in your email provider OR set up Cloudflare Email Routing (free) to forward `hi@`, `privacy@`, `legal@`, `security@` → your real inbox.

**Cloudflare Email Routing (recommended, 5 min):** Cloudflare dashboard → **Email → Email Routing → Get Started** → enable on `launchwings.com` → add catch-all rule → forward to your real inbox. This means anyone replying to our emails or emailing `anything@launchwings.com` reaches you, without paying for Google Workspace yet.

---

## Step 9 — When you're done, write the handoff back to me

Once Steps 0–8 are ☑, file a brief reply with:
1. The live URL response time (curl `time -v https://launchwings.com`).
2. LRS Stage 1 score from Step 6.
3. Any blocker / friction you hit (gold for `learnings.md` — these become tickets against the platform).
4. Number of handles claimed (Step 7).
5. Whether emails land in inbox or spam.

I'll write the **post-launch handoff** at that point: tagline iteration, build-in-public X thread template for the first announcement, the first 5 dogfood learnings turned into platform tickets, and a 30/60/90-day follow-on plan.

---

## Cost summary (everything stays $0 until launch day)

| Service | Tier | Cost |
|---|---|---|
| Vercel | Hobby | $0 (until commercial / launch day → Pro $20/mo) |
| Cloudflare DNS + Turnstile + Email Routing | Free | $0 |
| Resend | Free tier (3K/mo) | $0 |
| PostHog Cloud | Free tier (1M events/mo) | $0 |
| GoDaddy domain | Already paid | one-time |
| **Total ongoing** | | **$0/mo until launch day** |

You'll hit Resend's daily 100-email cap if you go viral early. That's a happy problem; we upgrade to $20/mo at that point.

---

## Things deliberately NOT in v0 (defer)

- Real OG image (placeholder for now; generate with Fal.ai during Step 6).
- Loops drip campaign (we send a single welcome email, not a 3-step sequence — keep it simple).
- A database for waitlist storage (signups land in your inbox via Resend; switch to Postgres when we have >50 signups).
- Server-side rendering of personalized content.
- Internationalization.
- A separate `/blog` or `/changelog` (add when there's content).
- shadcn/ui component imports (using plain Tailwind for v0; can add when complexity grows).

If you want any of these now, message me and we'll re-scope.

---

## Why I can't directly "handle the Vercel deployment"

You asked me to handle the deploy. The honest constraint:

- I have **no Vercel API token** in this environment, so I can't `POST /v13/deployments` from inside Claude Code.
- Even if you shared one in chat, we just learned what happens with shared keys (see Security Incident at top). **Don't.**

**What I CAN do for you (and just did):**
1. Wrote the code that *gets* deployed.
2. Diagnosed the most likely build-failure cause (Root Directory).
3. Made the code resilient to missing env vars (Turnstile + PostHog are optional now — Resend alone is enough to ship).
4. Fixed two specific TypeScript issues that would have failed `next build` in strict mode (`posthog.__loaded` typing).
5. Removed an unused `@react-email/components` dependency that bloated install.
6. Pinned `engines.node` to `>=20.x` so Vercel uses a known-good Node version.

**What you do (because only you have the credentials):**
- Set Root Directory in Vercel project settings (covered in the box at top of this doc).
- Click Redeploy.
- Send me the build error if it still fails.

**The future "I can drive Vercel" path** lives in `.claude/skills/deploy-from-github/SKILL.md`. Once you set up Infisical (per ADR-0003), I can run the deploy from a script that reads tokens from Infisical at runtime — never from chat. That's a separate small project; flag when you want to do it.

## Coordination

- **Stuck on a step?** File the symptom in `docs/dogfood/learnings.md` AND ping me. I'll diagnose and either fix the code OR write a clearer instruction.
- **Suggestions for the copy / hero / form?** Drop them in the same file; I'll fold them into the next iteration.
- **TM clearance** (per ADR-0004) is parallel work — start the USPTO TESS search today; doesn't block the landing page.
- **Send me the actual Vercel build error log** if the Root Directory fix doesn't resolve it. Lines from the first red `Error:` or `Failed:` to the end of the output.

Built carefully so the first founder-action of the project is small enough to fit on a coffee break. Ship now; iterate from real signups.
