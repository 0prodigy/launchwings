# Dogfood Landing Page + Waitlist — Week 0 Plan

> **First concrete deliverable.** Before any platform code, we ship our own marketing landing page with a working waitlist. This validates our stack manifest end-to-end, gives us a real artifact to share, and starts the email list we'll launch to in Week 11.

## Goals (in priority order)

1. **A live URL** with our positioning, signup CTA, and a working email capture.
2. **An email going to a real founder inbox** when someone signs up (welcome + magic-link-resume style).
3. **Analytics + funnel** so we can see signup conversion from day 1.
4. **Shareable** — OG image, Twitter card, branded screenshot for build-in-public posts.
5. **Ourselves as users** — every friction we hit becomes a ticket.

**Non-goals** (resist):
- Look pixel-perfect. Boring + clear beats clever.
- Have a product demo. We don't have a product yet. Don't fake one.
- Custom CMS, custom landing-page builder. MDX in Next.js, ship.

## Headline & sub (final, per ADR-0002)

> **LaunchWings — your always-on growth team.**
>
> Point us at your live product; we run a launch-readiness audit, then ship you to 30+ channels and keep compounding until you hit your first paying customers.

Below the fold:

- 3 outcome bullets ("we won't let you launch broken / we launch you to 30+ channels in your voice / we measure and tell you what to do next").
- Email capture (single field), label "Join the waitlist."
- Subtle "Built by [founder name] · [founder twitter] · hi@launchwings.com".
- Footer with privacy / terms / security stubs.

## Stack — the canonical manifest applied

| Capability | Choice | Why this & not that |
|---|---|---|
| Web framework | **Next.js 15** App Router | Per `07-oss-stack.md`. RSC, fast, Vercel-friendly. |
| Hosting | **Vercel Hobby** for now | Hobby is non-commercial — we MUST upgrade to Pro before public launch. Track this. |
| Domain | **`launchwings.com` (purchased 2026-05-07 per ADR-0004)** — defensive secondaries `launchwings.app` + `launchwings.dev` + `launchhand.com` to be acquired this week. | TM clearance Class 9 + 42 in progress per ADR-0004 action items. Red Bull "wings" mental adjacency mild; distinguishable in our class. |
| DNS | **Cloudflare DNS** | Free, fast propagation, per stack manifest. |
| SSL | **Vercel auto + Cloudflare** | Zero-config. |
| Form / waitlist | **Tally** (free tier) | Per `07-oss-stack.md`. Webhook → our endpoint. |
| Email transactional | **Resend** | Per stack. React-Email templates. |
| Email security | **Postmark** | NOT used yet (we have no auth). Reserve when we add Clerk. |
| Welcome flow | **Loops** free tier (1k contacts) | Drip after first email. |
| Analytics | **PostHog Cloud** free | 1M events / 5k recordings free; events + replay + flags from day 1. |
| Anti-bot on form | **Cloudflare Turnstile** | Free, no per-MAU. |
| OG image | **Generate via Fal.ai (Flux Dev)** then check in to repo | One-time cost, ~$0.025. |
| Schema.org | **JSON-LD** (Organization, Website) | Hand-written, no library yet. |
| Robots / sitemap | Next.js `app/robots.ts` and `app/sitemap.ts` | Static for now. |
| CSS | **Tailwind v4 + shadcn/ui** | Per stack. |
| Deploy CI | **Vercel git integration** (auto on push to main) | Boring. |
| Repo | This repo (`/home/user/dot`); landing in `apps/web` | Future-aligned with monorepo. |

**Out of scope this week**: Drizzle/Postgres, Clerk auth, Trigger.dev, LiteLLM, Browserbase, Stripe, BYOK, Mastra. We add them when there's something to do with them.

## Information architecture

```
launchwings.com/
├── /                       (home — the landing)
├── /audit                  (FREE LRS audit — coming-soon stub linking to waitlist)
├── /pricing                (4 tiers preview, "all locked behind waitlist for now")
├── /trust                  (privacy + sub-processors + DPA stubs)
├── /privacy
├── /terms
├── /security
├── /og-default.png         (1200×630 OG image)
├── robots.txt              (allow all)
├── sitemap.xml             (auto-generated from app router)
└── /thanks                 (post-signup confirmation)
```

`/blog`, `/docs`, `/changelog` are deferred until we have content.

## Implementation tickets (Week 0)

### DOG-01 — Repo scaffold

- pnpm workspace with `apps/web` for landing.
- Next.js 15 App Router, Tailwind v4, TypeScript strict.
- Drop in shadcn/ui Button, Input, Card.
- Basic `layout.tsx` with header + footer.
- ESLint + Prettier per future CONTRIBUTING.

**Estimate**: 0.5 day. **Owner**: founder.

### DOG-02 — Landing page content

- `/` page with hero + 3 outcome bullets + email capture form.
- Tailwind, mobile-responsive (Lighthouse mobile perf ≥85, SEO ≥95, a11y ≥95).
- OG image generated via Fal.ai (Flux Dev), 1200×630.
- Twitter card meta + JSON-LD Organization + Website schema.
- robots.txt + sitemap.xml.

**Estimate**: 1 day.

### DOG-03 — Waitlist via Tally + webhook

- Tally form embed (or custom shadcn form with `fetch` to Tally's API).
- Server route at `/api/waitlist` that receives Tally webhook, validates Turnstile token, dedupes by email, stores to a single `waitlist.json` in R2 (no DB yet).
- Bonus: emit a PostHog event `waitlist_signup` with utm fields.

**Estimate**: 0.5 day.

### DOG-04 — Welcome email via Resend

- React Email template `welcome.tsx`.
- On waitlist signup, server route triggers `resend.emails.send({...})`.
- Founder is BCC'd for the first 100 signups (manual review of patterns).
- Loops integration: pipe new signups into a 3-step Loops drip (welcome / "what we're building" / "how to join the early beta").

**Estimate**: 0.5 day.

### DOG-05 — Analytics

- PostHog snippet in `app/layout.tsx`.
- Events: `pageview` (auto), `waitlist_signup`, `cta_click`, `pricing_view`.
- A funnel: `pageview` → `cta_click` → `waitlist_signup`. Goal: ≥10% top-of-funnel.
- Microsoft Clarity for heatmaps (free, no caps).

**Estimate**: 0.5 day.

### DOG-06 — Domain + DNS

- **Domain**: `launchwings.com` (purchased per ADR-0004, 2026-05-07).
- This week: buy `launchwings.app` (~$14/yr) and `launchwings.dev` (~$13/yr) defensively at Cloudflare Registrar.
- Cloudflare DNS — A/CNAME for Vercel apex (`76.76.21.21`) + www (`cname.vercel-dns.com`); `proxied: false` mandatory (per `/deploy-from-github` skill).
- MX for Resend (`feedback-smtp.us-east-1.amazonses.com`); SPF + DKIM + DMARC TXT records so transactional emails aren't marked spam.
- Verify SSL via the deploy-from-github skill's healthcheck step.
- Reserve `@launchwings` social handles same day: X / LinkedIn / GitHub / ProductHunt / Bluesky / Threads.

**Estimate**: 0.5 day.

### DOG-07 — Trust stub pages

- `/privacy` — boilerplate from Termly or hand-rolled.
- `/terms` — same.
- `/trust` — placeholder sub-processor list (Vercel, Cloudflare, Tally, Resend, PostHog, Loops).
- `/security` — short note ("we follow industry-standard practices, security@launchwings.com for disclosure").

**Estimate**: 0.5 day. Use AI to draft, human to edit.

### DOG-08 — Build-in-public starter

- Twitter thread template: "Building a launch platform for solopreneurs. Here's the wedge." 8-tweet draft.
- LinkedIn post template: founder-voice ~800 chars.
- Reddit drafts for r/SaaS / r/IndieHackers / r/SideProject (rule-aware: r/SaaS Wednesday megathread; r/SideProject open).
- Schedule the first 2 across X + LinkedIn.

**Estimate**: 0.5 day.

### DOG-09 — Self-LRS audit

- Run our own (yet-to-be-built) Stage 1 audit *manually* on launchwings.com.
- Score: target ≥90 by end of week. If <90, every failing item is a ticket against the platform build (because they're real problems we want to detect for users).
- Document the score + findings in `docs/dogfood/LRS_AUDIT_LOG.md`.

**Estimate**: 0.5 day.

### DOG-10 — Learning capture

- Create `docs/dogfood/learnings.md`. Every friction, surprise, or "huh, that's annoying" in DOG-01 to DOG-09 becomes a numbered entry.
- Each entry maps to a future feature ticket (e.g. "the Tally → Resend handoff was confusing → ticket: build a 'connect waitlist to email' flow with native checks").

**Ongoing.**

## Success criteria for Week 0

- [ ] launchwings.com resolves with valid SSL.
- [ ] Lighthouse: perf ≥85 mobile, SEO ≥95, a11y ≥95.
- [ ] OG image renders correctly when shared on X / LinkedIn / Slack (test with Open Graph debugger).
- [ ] Submit form works end-to-end: Tally → webhook → R2 → Resend welcome email lands in inbox in <60s.
- [ ] PostHog dashboard shows pageviews + signups.
- [ ] At least 10 sign-ups by Friday from build-in-public posts.
- [ ] LRS Stage 1 score ≥90.
- [ ] `learnings.md` has ≥10 entries.

## What we deliberately don't do this week

- No auth, no Postgres, no Clerk, no Drizzle.
- No Stripe.
- No actual product / dashboard / inbox / Live Launch / agents.
- No paid ads.
- No SEO content / programmatic pages.
- No build-platform OAuth.
- No press outreach.

**The whole point of Week 0 is to validate that our chosen stack ships a polished marketing surface with a working email capture in 5 working days.** If we can't, that's the first major signal — and a chance to swap.

## Trip-wires that should pause spend

- 🚨 Domain / SSL / DNS not live by EOD Day 2 — investigate before continuing.
- 🚨 Lighthouse <70 on any axis — fix before public.
- 🚨 Resend → Loops handoff broken — find and fix; this is the keystone of all email features later.
- 🚨 PostHog not capturing events — instrumentation is free, no excuse.

## Ongoing rhythm after Week 0

- **Tuesdays** — X build-in-public thread.
- **Fridays** — waitlist email update (started after Week 1, weekly cadence).
- **Sundays** — review `learnings.md`, file tickets, celebrate the count of signups (no lie; if 12, say 12).
- **End of each sprint** — re-run Stage 1 audit on our own site. If score drops, something we shipped broke us. Fix.

## Coordination

- @ceo: signs off on tagline before any social post.
- @cto: signs off on stack choices before purchase.
- @safety-lead: reviews privacy/terms/trust pages before public.
- @growth-lead: sets the build-in-public cadence and content angles.
- @devops-product: handles any DNS/SSL/hosting issue.

## Why this is the right first move

We are building a product that runs launches for solopreneurs. We must run our own first. The landing page is the cheapest, fastest, most honest validation of:

1. Whether our stack manifest survives a real build.
2. Whether our positioning resonates (waitlist signups in week 1).
3. Whether our agents (when built) can actually replicate or improve on what we're doing manually.
4. Whether we can describe what we do in 60 seconds to a stranger.

A landing page in 5 days. A waitlist with 100 names by week 4. A real ProductHunt launch by Week 11. **In that order.**
