---
name: dogfood-launch
description: Orchestrates LaunchWings's own launch flow run on LaunchWings. Use when planning, executing, or debugging anything related to our own product's pre-launch (landing page, waitlist, SEO content, build-in-public posting, ProductHunt drop). Every learning we extract from launching ourselves shapes the product.
---

# Dogfood Launch — Run LaunchWings on LaunchWings

> Every product decision should be informed by the experience of using our own product. We are our own first ICP. Every friction we hit IS a feature ticket.

## Why dogfood matters here

The PRE_MORTEM lists "founder-product fit" as a Class D risk: building a growth tool when we have never run growth ourselves. The mitigation is to **be our own user from day 0**: build the landing page, build the waitlist, do the build-in-public posts, and run our own LaunchWings launch when MVP ships.

Every friction is a real signal. If we forget our Tally → Resend → notification chain, our users will too.

## The dogfood timeline

### Week 0 — Today (pre-MVP)

Stand up a real landing page + waitlist + email capture using our chosen stack manifest (from `docs/research/07-oss-stack.md`). This is the **first concrete deliverable** before any platform code. Per `docs/dogfood/LANDING_PAGE_PLAN.md`.

### Weeks 1–8 — During build

- Post 2× per week on X about progress (the Build-in-Public Agent we will eventually ship — but manually for now). Capture the posts that work; they become the agent's training data.
- Send a weekly Friday email to the waitlist with progress. (We will ship this as the Newsletter Agent later; the human-written cadence is our gold standard.)
- Document every annoyance. Every "why didn't anyone build this?" is a checklist item.

### Weeks 9–10 — Pre-launch

- Run our own Launch Readiness Checklist Stage 1 against our marketing site. Whatever fails IS a real bug we ship to fix.
- Generate our own launch artifacts using the agents we just built (X thread, LinkedIn post, Show HN post, Reddit drafts for r/SaaS / r/IndieHackers / r/microsaas). Critic-Refiner them.
- Build the ProductHunt assets (4 screenshots ≥1270×760, gallery video <60s, tagline ≤60 chars).
- Email 1,000-person waitlist 7 days out, 1 day out, day-of.

### Week 11 — Launch day on Product Hunt

- Hunter: tier-1 maker (Marc Lou or Greg Isenberg).
- Schedule: 12:01 AM PST.
- Run our own Live Launch Dashboard.
- Run our own Comment Monitor.
- Goal: #1 Product of the Day, 1,500+ upvotes, 2,500 signups, ~150 paid (10% day-1 promo).

### Weeks 12–24 — Compound on ourselves

- Run our own Programmatic SEO Agent on `/alternatives/[competitor]` and `/launch-checklist/[product-type]` clusters.
- Run our own Cold Outreach Agent against our own ICP list.
- Use Insight Agent to find our own retention drop-offs.
- Document every false positive / annoyance. They become eval datasets.

## What dogfooding teaches us

Every friction hits twice: as a user (we suffer) and as a product team (we now know). Examples we expect:

- **OAuth flow back to Resend / beehiiv / X / LinkedIn** — find the worst step. Fix it before users ever see it.
- **The first time our own LRS Stage 1 fails** because we forgot OG image meta — we ship the auto-fix that solves it for future users.
- **The weight of the approval inbox** with 60 drafts in front of us — we redesign before users feel it.
- **Our own attribution gaps** when we look at "where did this signup come from?" — we close them in Bundle 9.
- **The cost of running our own agents** in real $ terms — we calibrate plan limits.

## Anti-patterns

- **"We're too busy building to dogfood."** That's exactly when to dogfood. Skipping leads to shipping a product we wouldn't use.
- **Two different stacks** (one for us, one for users). Resist. Same Tally, same Resend, same Stripe.
- **Letting the dogfood landing page lag the product.** It's the canary. If our own page goes stale, founders see a graveyard.
- **Not capturing learnings.** Every dogfood pain is a `dogfood/learnings.md` entry. Every one becomes a ticket within 7 days.

## Coordination

- @growth-lead: owns the dogfood marketing schedule (twice-weekly posts, weekly email).
- @cto: every dogfood pain is a JIRA ticket; track velocity.
- @safety-lead: our own outbound is also subject to the monitor model.
- @ceo: dogfooding is non-negotiable scope; do not deprioritize.
