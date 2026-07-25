# ADR-0005 — Outcome-aligned take-rate as the pricing model

## Status

**Superseded by [ADR-0006](0006-pivot-to-ig-launch-concierge.md)** — 2026-05-14.

Status was "Accepted" earlier the same day; the wedge pivot later in the
day killed both the solopreneur ICP and the take-rate model.

The discussion below remains as a historical reference for *why* take-rate
was attractive given the original wedge. Under the post-pivot product
(IG launch concierge for streetwear / capsule-fashion brands), pricing is
flat-tier subscription (Starter $79 / Growth $149 / Scale $249) — see
[`docs/brand/PRICING.md`](../brand/PRICING.md). Stripe Connect is killed;
take-rate is killed.

## Context

LaunchWings sells a daily next-action copilot to solopreneurs after they ship. Three pricing models were available:

1. **Tier-based SaaS** ($19 / $49 / $129) — high friction, indistinguishable from a hundred existing tools.
2. **Usage-priced** (per agent run, per post) — punishes the heavy user precisely when they are most committed.
3. **Outcome-aligned take-rate** — $0 base, percentage of attributed paying-customer revenue.

Two structural facts forced the choice:

- The generative half of the product (draft taglines / hero copy / X threads / Reddit posts / FAQ / SEO pages / OG images) is replicable today by free Claude Code plugins (`claude-seo`, the Anthropic first-party Marketing plugin, MIT skill collections). Selling a tier on generation alone is a 6-month moat.
- Solopreneurs reading 2026 IndieHackers / r/SaaS threads describe the same pain: *"built it, no customers, now what."* The buyer's check is not on output volume; it's on whether the product moves the only metric they actually care about — paying customers.

A pricing model whose unit of value aligns with the buyer's unit of value (paying customers, not posts) was the only model that could survive plugin pressure.

## Decision

Adopt outcome-aligned take-rate as the only pricing model:

- **$0 base.**
- **10% of net attributed MRR** (gross − refunds − disputes − chargebacks) computed month-end.
- **Capped at $500 per launch.**
- **90-day attribution window** from launch start.
- **Sunset at 12 months.**
- **Collected as a Stripe Connect Express application fee** (or Polar / Lemon Squeezy Connect equivalent) at charge time, never via invoice.

Onboarding hard-gates on connection to a supported processor. Founders not on Stripe / Polar / Lemon Squeezy are auto-refused.

## Why these specific numbers

- **10%.** Industry benchmarks for performance-priced SaaS (HubSpot Breeze, Intercom Fin) cluster at 8–15% of outcome value. 10% is the round number that reads as "fair but real."
- **$500 cap.** The trust statement that prevents adverse selection at scale. A founder who hits $5k MRR in 90 days pays no more than $500 — anything past that and we are taxing momentum we did not create.
- **90-day window.** Long enough to capture the actual launch-attributed revenue (most launches' customer-acquisition decays past Day 60). Short enough that the founder is not paying us for revenue they earned themselves a year later.
- **12-month sunset.** Even within the cap, the take-rate ends. The product earns its place in the daily routine; if it stops earning by month 13, the founder should not still be paying for it.
- **Net not gross.** Pricing-unit alignment. A founder cannot stay if we take 10% of revenue they did not keep.
- **Express not Standard.** Express gives the platform dispute control, 1099/KYC handling, and embedded onboarding inside our flow. Standard supports `application_fee_amount` but forces the platform to manage tax and bear no dispute control — fragile during the first dispute window. (Earlier framing that Standard "forbids" charge-time application fees was wrong; the substantive reasons for Express stand.)

## Attribution mechanism (load-bearing)

The take-rate only works if attribution is provable and collectable.

**Provable.** Every published channel link is rewritten to `app.launchwings.com/go/[launchId]`. The Worker captures the click server-side, signs a `lw_lid` HMAC param, and 302s to the destination. Source of truth for `launchId → destination` is Neon; KV is a hot read-through cache populated cache-aside on miss (KV's up-to-60-second propagation makes it unsafe as authoritative storage for a launch URL created at signup and posted minutes later). When a `charge.succeeded` event fires, the matcher tries `lw_lid` round-trip → device fingerprint → click-time email. Refund / dispute / chargeback events also subscribe so net MRR is real, not gross.

**Collectable.** Stripe Connect application fee at charge time. The founder cannot route around it without disconnecting their processor — and disconnecting is one click in their Stripe dashboard, a clean exit, not a default.

**Unordered webhook delivery.** Stripe webhook delivery is unordered. `charge.succeeded` can arrive before `customer.created`. The pipeline writes `attribution_method='unattributed'` on initial miss and re-matches the row 24 hours after `customer.created` lands. Without this re-match loop, paying customers silently disappear from the cohort.

## Wave-0 bridge

The Stripe Connect Express platform application has a 2–4 week regulatory dependency. The first cohort of design partners signs the Vertical Wedge Partner Agreement and is billed via manual Resend invoice on the agreed gross basis during the bridge. Wave-1 onward uses Connect application fees end-to-end. Any single Wave-0 dispute pauses onboarding new partners until either Connect is live or the dispute resolves with a written amendment to the Agreement.

## Consequences

### Positive

- Sales motion is honest: *"$0/mo. We don't get paid until you do."* Removes the entire pricing-objection conversation.
- Compounds with success — every paying customer attributed to a LaunchWings action is one we share in.
- Survives plugin pressure: a free Claude plugin cannot stand as a Stripe platform, cannot hold a click vault, cannot enforce an application-fee at charge time.
- Aligns with the cohort warehouse (`PRD.md` F7) — every attributed customer row is a future answer to a future founder's recommendation.

### Negative / accepted

- Connect Express onboarding is friction. Trip-wire: < 80% Connect onboarding completion across design partners → renegotiate gating before adding new partners.
- Express country coverage excludes India, parts of SEA, BR, parts of LATAM. Founders in those geographies are routed to Polar / Lemon Squeezy where available; otherwise auto-refused. Anti-ICP exclusion is real and we accept it for v1.
- Refund-aware net computation adds engineering cost (the deferred re-match loop and refund-event subscription). We accept this — gross-MRR billing without refund logic would fail at the first high-refund cohort.

## Kill criteria

If after 90 days of beta and ≥ 10 launches the median attributed paying customers per launch within 30 days is < 3, the wedge is wrong. Kill the take-rate model, pivot, or shut down. Two pricing-mechanism trip-wires also pause spend:

- Redirect-click attribution rate < 70% → pause take-rate billing, investigate matching.
- Stripe Connect Express onboarding completion < 80% of design partners → renegotiate the hard-gate.

## Open questions

1. Polar and Lemon Squeezy Connect-equivalent maturity — verify monthly against vendor announcements.
2. Whether to surface attribution-rate transparently on the founder's dashboard (UX dignity vs. operational transparency) — `@product-designer` to decide before public beta.
3. Disclosure language for the Stripe Connect application fee in onboarding — `@copy-review` and `@safety-lead` joint review required before sign-up flow ships.
