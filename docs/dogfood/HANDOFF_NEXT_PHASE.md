# Handoff — Next Phase

> Last updated: 2026-05-08. Replaces the founder-ops checklist that ran from 2026-05-07. `HANDOFF_LANDING_PAGE.md` remains preserved as historical.
>
> **Where we are:** launchwings.com is live, build is green, waitlist API works end-to-end, Resend env vars + domain verified, Cloudflare email routing live, token rotations done. The pre-launch ops scaffolding is closed out.
>
> **The only thing left in founder hands** is build-in-public posting cadence — and even that is a temporary stopgap until the platform's social agent ships (PRD F2 / ROADMAP Phase 3). Everything else moves into product work.

---

## What the founder still does manually (until the platform catches up)

### Build-in-public posting — folder-driven, founder publishes

The platform will eventually connect a founder's social accounts and post on their behalf — that is **already specified** in `docs/product/PRD.md` §F2 ("Generate + schedule social drafts") and queued for ROADMAP Phase 3 specialist agents. We are not filing a new ticket for it; the spec exists.

Until that part of the platform exists, the dogfood loop is:

1. New posts get drafted into `docs/dogfood/posts/<YYYY-MM-DD>-<slug>.md`. One file per post.
2. Each entry in `docs/dogfood/learnings.md` produces at least one post draft (per the `dogfood-launch` skill cadence — 2× per week minimum).
3. Founder copies the draft into X / LinkedIn / wherever, posts it, and pastes the post URL back into the file under a `Posted:` line so we have an attribution trail.
4. When the social-posting agent ships, that backlog of folder-stored drafts becomes our first integration test corpus — every post we wrote ourselves becomes a fixture.

The first pinned post — the LaunchWings positioning thread — is the founder's call to draft and ship; queue it as `docs/dogfood/posts/2026-05-08-pinned-positioning.md` when ready.

---

## Now-active dogfood work (in progress, branch `dogfood/lrs-stage1-audit`)

### DOG-09 — Run LRS Stage 1 audit on launchwings.com

This is the single highest-leverage piece of dogfood we have right now: every failure on our own site becomes a concrete spec for the LRS Audit Agent (the wedge per VISION.md).

- Walk all 18 items in `docs/product/LAUNCH_READINESS_CHECKLIST.md` Stage 1 against `https://launchwings.com`.
- Score each ✅ / ⚠️ / ❌ in `docs/dogfood/LRS_AUDIT_LOG.md`.
- Each ❌ produces a corresponding ticket under `docs/tickets/` whose acceptance criteria become an evaluator in `LRC-02`.
- Lighthouse run (mobile, prod URL): perf ≥85, SEO ≥95, a11y ≥95.
- Every failing item → numbered entry in `learnings.md` AND a platform ticket.

This branch is doc-only by design; nothing here should retrigger the Vercel build on the base branch.

---

## Open platform tickets surfaced by prior dogfood (carry-over)

These came out of real friction during launch ops; they remain queued and should each be a ticket file in the right bundle when their phase comes up:

- `LRS-DNS-001` — DNS proxy-posture audit (catches Cloudflare orange-cloud-on-Vercel + underscore-prefixed proxied records). Bundle 2.
- `EMAIL-001` — synthetic email-pipeline monitor with one-click test-send. Bundle 5 + 12.
- `T&S-002` — production agent worker host-allowlist + customer-facing trust disclosure. Bundle 12 + 13.
- `DEPLOY-001` — ephemeral token broker for customer deploys. Bundle 13.
- `SEC-001` — secret-leak detector in chat surfaces. Bundle 12.

---

## Deliberately deferred

- **Loops drip / nurture sequence** — single welcome email is enough until >50 signups.
- **Database for waitlist storage** — Resend founder-notification email is the storage tier.
- **Trademark filings** — separate parallel work; doesn't block. Per ADR-0004 action items.
- **Build-platform partner outreach** — Q3+ per `docs/research/10-future-expansion.md`.
- **Stage 2 / Stage 3 LRS items** — Q2+ per the bundles dossier.

---

## How to file blockers

Anything that surprises you, slows you down, or feels broken → `docs/dogfood/learnings.md` as a new numbered entry. Each entry maps to a future platform ticket. **The friction we experience IS the product spec for the LRS audit and the agents we'll ship later.**

---

## Cost summary

| Service | Tier | Cost |
|---|---|---|
| Vercel | Hobby | $0 (until launch day → Pro $20/mo) |
| Cloudflare DNS + Turnstile + Email Routing | Free | $0 |
| Resend | Free (3K/mo) | $0 |
| PostHog Cloud | Free (1M events/mo) | $0 — when wired |
| GoDaddy domain | one-time | already paid |
| **Total ongoing** | | **$0/mo** |

Documented upgrade triggers in `learnings.md` #2.
