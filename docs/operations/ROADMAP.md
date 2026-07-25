# Roadmap

*Execution plan. Anchored on the [PRD](../product/PRD.md) and
[Charter](CHARTER_2026_05_14.md). 18-month horizon.*

## Phase 0 — Foundations (weeks 1-4)

Goal: ship the skeleton that doesn't break under a real customer.

**Engineering:**
- Strip the old wedge codebase: cohort warehouse, redirect-link service,
  Stripe Connect, take-rate billing, differential-privacy module
- Stand up Meta Graph API client (Instagram Business + Facebook Page DM)
- Stand up Shopify OAuth + Storefront API + Admin API client
- pgvector setup on Neon, embedding pipeline scaffold
- Clerk auth wired
- Stripe subscriptions (no Connect)
- Trigger.dev tasks scaffolded for: ingestion, tone-card refresh, launch
  beat scheduling

**Non-engineering:**
- Meta Business Verification submitted (gates production)
- Shopify App Store listing submitted (2-4 week review)
- Brand site updated to reflect new wedge (launchwings.com)
- 5 streetwear founders identified for design-partner outreach (compliant
  channels: Reddit, Discord, email)

**Exit criteria:**
- One end-to-end test tenant can connect IG + Shopify, ingest its corpus,
  and receive a brand-voice draft.

## Phase 1 — Design Partners (weeks 5-12)

Goal: 10 paying design partners. $390/mo MRR (10 × $39 Wave 0).

**Engineering:**
- F1 Brand-Voice Engine end-to-end (ingest, tone-card, RAG retrieval,
  edit capture)
- F2 Launch Playbook: Drop and Restock sequences (other 3 in Phase 2)
- F3 DM autoreply + comment-to-DM for IG (FB Page DM in Phase 2)
- F4 Shopify basic connector (order status DM, abandoned cart DM)
- F5 Hot-Lead Inbox: scoring + push notification
- F6 Launch Dashboard (mobile-first PWA)
- Safety pipeline complete: 24h window, brand-policy, rate cap, audit log

**GTM:**
- Reddit case-study posts (r/streetwear, r/Shopify)
- Discord community participation (Sole Supremacy, Heat Hub, brand-fan)
- Cold email to brand contact addresses (NOT IG DM via product)
- Twitter/X outreach to founders
- Weekly customer-success cadence with each design partner

**Exit criteria (end of week 12):**
- 10 paying design partners
- Brand-voice edit-rate: cohort median ≤ 45% at day-30 of each customer's
  use (definition: PRD F1 acceptance). This is the same metric used in
  the kill criterion and the unit-economics model — one definition
  across all docs.
- Zero Meta API ban incidents
- Two weekly published case studies

## Phase 2 — Open Beta (weeks 13-26)

Goal: 100 paying customers. $20-30K MRR.

**Engineering:**
- F2 expand: Capsule, Flash Sale, Pre-order sequences
- F3 expand: FB Page DM + IG Stories reply
- F4 expand: restock-event trigger, customer-tag write-back
- Hot-Lead model retrain weekly
- Tone-card refresh job tuned (daily)
- Founder-facing analytics dashboard (edit-rate trend, auto-handle rate,
  hot-lead conversion)
- Meta Tech Partner submission filed
- Multi-language brand voice (Spanish, Portuguese)

**GTM:**
- Shopify App Store listing live (since week ~6)
- Pay 5-10 medium IG creators to demo on their drops
- Product Hunt launch
- Referral program live: 20% rev-share for first 3 months per referred customer
- Light paid Meta ads (target: IG business accounts with recent drop posts)
- Expand vertical from streetwear to beauty + accessories

**Exit criteria (end of week 26):**
- 100 paying customers
- $20-30K MRR
- Wave 0 design partners off the $39 plan onto $79+ (or successfully
  re-priced)
- Net churn < 8%/month
- Average edit-rate < 45% across cohort

## Phase 3 — Scale (months 7-12)

Goal: 250 paying customers. $50-75K MRR.

**Engineering:**
- WhatsApp Business integration scaffold (LATAM beta)
- TikTok Shop API integration evaluation
- Advanced analytics: revenue attribution waterfalls, customer-lifetime
  value model, drop-comparison reports
- Founder-collaboration mode (multi-user accounts, for brands with a 2-3
  person team)
- Browser extension or Shopify-admin overlay for in-context approval
- Meta Tech Partner badge secured

**GTM:**
- Meta Ads scaled (target: $50K/mo paid acquisition spend at $200 CAC)
- Conference presence: Shopify Editions, Subsummit, Sneaker Con,
  ComplexCon adjacent
- Affiliate channel: 30% rev-share for IG-growth coaches + DTC agencies
- International expansion: Brazil + Spain (Manychat's weakest AI surfaces)
- Influencer-grade case studies for top 3 customers (each generates 50+ inbound)

**Exit criteria (end of month 12):**
- 250 paying customers
- $50-75K MRR
- NRR ≥ 105%
- Edit-rate < 35%
- Meta Tech Partner badge
- Shopify Plus Certified App status

## Phase 4 — Series A (months 13-18)

Goal: 500-1000 customers, $300-500K MRR, Series A close.

**Engineering:**
- TikTok Shop integration live
- WhatsApp Business GA in LATAM
- Multi-brand console (Scale tier) hardened
- Custom launch-playbook authoring (Scale)
- Outbound API for power-user agencies
- v1 of cohort analytics (DM-to-checkout funnel benchmarks per vertical) —
  optional, post-MVP only after we have 200+ customers' consent

**GTM:**
- Series A fundraise (target: $5-15M at $50-100M post)
- Dedicated customer success hire
- Marketing hire to scale content / community
- Vertical expansion: jewelry, supplements (with regulatory review),
  home goods

**Exit criteria (end of month 18):**
- 500-1000 paying customers
- $300-500K MRR
- NRR 105-115%
- Burn multiple < 1.2x
- AI-touched revenue ≥ 70%
- Series A term sheet signed OR confident bootstrap path to $1M ARR
- Brand-voice edit-rate < 30%

## Capital plan

Operating assumption: bootstrap until $5K MRR proven, then pre-seed
$1.5-3M at $10-15M post to fund Phase 3 + Phase 4 if growth justifies.

If growth doesn't justify a raise: continue bootstrapping (HighLevel
exists as proof a $80M+ ARR business can be built without VC in this
space).

## Recruitment plan

Phase 0-2: 2 founders (engineering + product/GTM). No hires.
Phase 3: +1 engineer (founder-led), +1 customer-success specialist.
Phase 4: +2 engineers, +1 marketer, +1 designer. Plus first heads-of for
Series A optics.

## Kill criteria (auto-pivot)

Per `PRD.md` and `CHARTER`:
- < 10 paying customers after 120 days of GA → wedge wrong
- ARPU < $79 after 6 months → pricing wrong
- Launch-Playbook usage < 50% monthly → F2 wrong
- Edit-rate > 50% after 30 days → F1 wrong; moat broken
- Meta API ban rate > 2% per quarter → safety failed
- Monthly churn > 8% after month 6 → product-fit wrong

Hit any → pause the roadmap, run 7-day diagnosis, re-charter or shut down.
