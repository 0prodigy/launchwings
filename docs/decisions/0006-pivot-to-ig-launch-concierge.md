# ADR-0006 — Pivot to AI Launch Concierge for Instagram + Facebook brands

## Status

**Accepted** — 2026-05-14.

Supersedes:
- ADR-0005 (Outcome-aligned take-rate) — pricing model is now flat-tier
  subscription.

**Note on same-day supersede:** ADR-0005 was accepted earlier on
2026-05-14. Later the same day, in the wedge re-think conversation, the
user explicitly killed both the solopreneur ICP and the take-rate
pricing model in favor of the new IG launch concierge wedge. The
supersede happens same-day because the strategic decision happened
same-day. This is documented in the conversation transcript and in
`docs/operations/CHARTER_2026_05_14.md`. ADR-0005 is retained as
historical record, not deleted, so the reasoning is preserved.

Affects:
- `docs/product/VISION.md`, `PRD.md`, `PRODUCT.md`, `USER_JOURNEY.md`
- `docs/product/COMPETITIVE.md` (new)
- `docs/operations/ROADMAP.md`, `PRE_MORTEM.md`, `FUNDRAISE.md` (new),
  `CHARTER_2026_05_14.md` (new)
- `docs/brand/PRICING.md`
- `.claude/agents/*` (downstream — update where wedge embedded)

## Context

The pre-pivot LaunchWings was a daily next-action copilot for B2B SaaS
solopreneurs post-launch, with a cross-cohort outcome warehouse as its
moat and a 10% take-rate on attributed paying-customer MRR as its pricing
mechanism (ADR-0005).

Two structural problems became undeniable on 2026-05-14:

1. **The wedge is too narrow for day-1 cash.** The cohort warehouse moat
   requires k≥50 launches in a vertical before delivering any meaningful
   benchmark answer, which is a chicken-and-egg deadlock. The DIY-builder
   cohort (Hermes Agent, OpenClaw, Paperclip, Claude Skills users) keeps
   growing and will not pay a take-rate product. Hermes Agent's 2026
   launch made this concrete — the agent-body layer is commoditized OSS,
   and any wedge living on top of it must defend against drift toward
   build-your-own.

2. **Pricing was anchored too early.** Take-rate pricing forced Stripe
   Connect Express integration, KYC handling, and server-side attribution
   infrastructure before product-market-fit was even tested. The user
   explicitly flagged this on 2026-05-14: "We want much more confidence
   of product-market-fit and need, so be aware of this instead of getting
   lost in stacks and internal product build process. We need to unlock
   user usecase and product first."

The user requested a full repivot toward an AI-native product with viral
distribution, day-1 paying subscribers, and a "clone proven product +
add wedge + add uniqueness" approach.

## Decision

LaunchWings is rebuilt as **the AI launch concierge for Instagram +
Facebook native product brands**, starting with **independent streetwear
and capsule-fashion labels (5K-50K followers, $100K-$2M annual revenue,
Shopify or Etsy backed, drop / restock at least monthly)** in the US, UK,
and AU markets.

Six features ship in the v1 MVP (14 weeks):

1. **Brand-Voice Engine** — RAG over the merchant's last 100-200 IG
   captions + Shopify product copy + past customer-DM threads + FB Page
   posts, stored in pgvector. Tone-card extraction by Claude Opus 4.7.
   Every founder edit on a generated draft is captured and re-weights
   retrieval. This is the moat: months of accumulated per-customer edit
   history is non-portable and not copyable in a competitor's 6-month
   sprint.
2. **Launch Playbook** — Pre-built multi-beat sequences (Drop / Restock /
   Capsule / Flash Sale / Pre-order) that draft every caption, DM
   autoreply rule, and comment-to-DM trigger for the launch in the
   merchant's voice. Founder approves before send. No vendor in our
   37-product scan ships this orchestration.
3. **DM + Comment Engagement** — Meta-Graph-API-native; IG DM + IG
   comments + IG Stories reply + FB Page DM. Strict 24-hour-window
   compliance. Never bulk DM. Multi-language (English, Spanish,
   Portuguese day-1, where Manychat AI is materially weaker).
4. **Shopify-Native Connector** — Order status, shipping, abandoned
   cart, restock notifications, all in brand voice through IG/FB DM.
   This is the open wound Manychat left when their native Shopify
   integration was dropped in 2025.
5. **Hot-Lead Inbox** — High-intent DM threads surface to the founder
   for personal reply. Composite scoring (Haiku). The AI does the
   boring; the founder closes the warm.
6. **Launch Dashboard** — Single mobile-first PWA screen during a
   drop. Posts going out, DMs flowing, hot leads queued, revenue
   attributed live.

Pricing is **three flat-monthly tiers with AI bundled** ($79 / $149 /
$249), with per-tier AI-reply caps that soft-cap to Haiku-only mode at
100% (never a hard cutoff or surprise overage). Design-partner pricing
is $39/mo for 12 months for the first 10 customers, sunsetting to $79.

The architecture re-uses the existing Vercel + Neon + Trigger.dev +
Clerk stack. Meta Graph API integration, Shopify OAuth + Storefront API,
pgvector for per-tenant corpus, Claude Opus 4.7 for tone-sensitive
generation, Claude Haiku 4.5 for high-volume routing. Stripe is used
for flat subscriptions only — no Connect, no application fees.

The fundraise narrative is the **expansion story** (Klaviyo-shape): IG
launch concierge → multi-channel social-commerce SaaS for SMB → $100M
ARR path. Pre-seed raise after 10 paying customers + $5K MRR + 30-day
retention proven. Series A at $4-6M ARR at month 18.

Killed in the pivot:
- Solopreneur post-launch copilot wedge
- Cross-cohort outcome warehouse
- Differential-privacy aggregates
- Redirect-link attribution service
- Stripe Connect Express integration
- Take-rate billing
- Various ticket / sprint docs already deleted in `git status`

## Consequences

### Positive
- **Day-1 cash mechanic.** Self-serve credit-card subscription at $79+
  matches the user's "paying subscribers from day one" requirement.
- **Sharp ICP.** Streetwear + capsule-fashion has tight community
  virality (Reddit r/streetwear, ComplexCon, Discord servers).
  Testimonials convert peers fast.
- **Real moat narrative.** Edit-history flywheel is honest about the
  mechanism (RAG + feedback loop, not model-weight fine-tuning) and
  is non-portable.
- **No cohort dependency.** Each tenant gets value on day 1 from their
  own corpus; no k≥50 chicken-and-egg.
- **Open category window.** Manychat (incumbent) was hit by pricing
  trauma in March 2026 and shows clear weaknesses (AI add-on, lost
  Shopify-native, generic prompt templating). The migration window is
  real.

### Negative
- **Existing codebase requires significant strip-and-rebuild.** Cohort
  warehouse, redirect-link service, Stripe Connect, take-rate billing
  modules all die. Weeks 1-2 of Phase 0 are deletion + re-scaffolding.
- **Meta API platform risk is the new dominant external risk.** Class A
  in the pre-mortem. Mitigated by Tech Partner submission, 24h-window
  discipline, and audit-log compliance.
- **Brand-voice quality must be measurably superior.** If founders edit
  > 50% of drafts after 30 days, the moat narrative collapses. Kill
  criterion documented.
- **Smaller initial TAM than the original pitch.** Streetwear + capsule-
  fashion is ~30-60K SMB on Shopify. Phase 1.5 expansion adds beauty +
  accessories. Year 2 adds TikTok Shop + WhatsApp.

### Neutral
- Domain `launchwings.com` retained (ADR-0004 stands; "launch" + "wings"
  maps acceptably to the new wedge).
- Vercel + Neon + Trigger + Clerk stack retained.
- Sub-agents in `.claude/` need updates where they embed old wedge
  assumptions, but their general structure (ceo, cto, growth-lead,
  safety-lead, etc.) carries over.

## Why not the alternatives we considered

The 2026-05-14 critical-decision flow surfaced three other B2B candidate
wedges (AI Quality/Eval Ops; AI Governance & Compliance; AI ROI for CFO).
All three were rejected by the user as "too much building first product"
— long sales cycles, procurement gates, no day-1 cash.

After that, four AI-native consumer/prosumer/SMB candidates were
considered:
- **Cluely-clone (live AI interview cheat):** Fast viral, ethics edge,
  Zoom/Meet detection arms race. Rejected on brand risk.
- **Tweet Hunter clone (founder ghostwriter):** Strong wedge but Tweet
  Hunter's incumbent base is sticky and the wedge-on-wedge brittleness
  is real. Rejected for current option.
- **Rizz clone (AI dating coach):** Fast viral, ethical edge. Rejected on
  brand risk and ICP fit.
- **Heidi/Freed clone (AI medical scribe):** Most durable, slowest to
  ship (HIPAA + EHR integration). Rejected on day-1 cash requirement.

The user then explicitly narrowed the direction toward "Taplio for
Instagram for product launch, including bot engagement with brand voice
for existing FB/IG businesses." That is the wedge captured in this ADR.

## References

- Charter: `docs/operations/CHARTER_2026_05_14.md`
- Research: `docs/operations/RESEARCH_2026_05_14_WEDGE.md`,
  `RESEARCH_2026_05_14_INVESTOR_NARRATIVE.md`, and the four research-stream
  transcripts (competitive landscape, Manychat dossier, adjacent vendor
  matrix, investor narrative) in conversation history
- Memory: `feedback-launchwings-strategy-lead-with-usecase`,
  `project-launchwings-pivot-2026-05`
- Manychat $140M Summit-led Series B:
  https://techcrunch.com/2025/04/22/manychat-taps-140m-to-boost-its-business-messaging-platform-with-ai/
- Klaviyo 2024 financials: https://investors.klaviyo.com/news/news-details/2025/Klaviyo-Announces-Fourth-Quarter-and-Fiscal-Year-2024-Financial-Results/default.aspx
- Gorgias 2024 ARR / valuation:
  https://www.saastr.com/the-latest-at-saastr-fund-revenuecat-series-b-gorgias-makes-ai-really-work-a-top-coo-for-owner-and-more/
- Meta IG ban wave 2025:
  https://techcrunch.com/2025/06/16/instagram-users-complain-of-mass-bans-pointing-finger-at-ai/

## Review trigger

Re-open this ADR if any of:
- 6 months pass without 10 paying customers
- Brand-voice edit-rate stays > 50% after 30 days for the median customer
- Meta API ban rate > 2% per quarter
- Manychat ships brand-voice + drop-mode + bundled AI before us
- A clearer wedge emerges from operating data
