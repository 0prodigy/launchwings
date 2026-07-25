# Pre-Mortem — How LaunchWings Dies

Risk-budgeting. The failure modes that have historically killed AI-native
SMB SaaS products, IG-automation tools, and brand-voice plays. Made
explicit so we mitigate or accept upfront.

This is the post-pivot pre-mortem (2026-05-14). The pre-pivot version
focused on solopreneur attribution / Stripe Connect / cohort warehouse;
all of those are now dead and not relevant.

## Class A — platform death (extinction events)

### A1. Meta API platform regression

**What happens:** Meta tightens automation policy, cuts the rate limits,
re-classifies "AI agent" outbound as bulk-DM, or sunsets the Business
Messaging Platform partner program. Our product stops working for every
customer at once.

**Historical precedent:** Manychat lost native Shopify integration in
2025; Meta cut Messenger Recurring Notifications Jan 2026; mass IG ban
wave May-Aug 2025. Pattern is real and recurring.

**Probability:** HIGH (some form of this happens every 18-24 months)
**Severity:** Catastrophic (90%+ revenue impact in worst case)

**Mitigations:**
- Meta Tech Partner status by month 12 — first to learn of policy changes
- Strict 24h-window compliance from day 1; never bulk DM; never automated
  outbound outside conversational context
- Conservative rate-cap defaults (per-thread, per-tenant) below Meta's
  thresholds
- Audit log every outbound; able to demonstrate compliance to Meta in
  an investigation
- Secondary surface plan: WhatsApp Business by year 2; SMS fallback
  considered if IG access becomes hostile
- A monthly Meta-policy-review meeting; subscribe to Meta Developer
  Updates

### A2. Manychat ships brand voice + drops

**What happens:** Manychat uses $140M to bolt on RAG over customer
content + a "Drop Mode" in Flow Builder. Our differentiation collapses.

**Probability:** MEDIUM-HIGH within 6-12 months
**Severity:** Significant (compresses our pricing power)

**Mitigations:**
- The edit-history flywheel — months of accumulated per-customer edits is
  not a feature you ship in 6 months; it's a backlog you accumulate
- Ship deeper IG-native UX they can't bolt on (mobile-first PWA, drop-
  culture vocabulary, Hot-Lead Inbox UX)
- Shopify-native depth Manychat let lapse
- Price below them ($79 vs Manychat's $14 base + $29 AI = $43+, but
  Manychat customers leak on Pro + AI ≈ $98+)
- Move on Meta-refugees before Manychat fixes their pricing trauma

### A3. Klaviyo bundles IG DM into Composer AI

**What happens:** Klaviyo adds IG DM as a free feature of their email
plan. SMB shops already paying Klaviyo get the channel "for free" and
switching cost becomes the entire product.

**Probability:** MEDIUM within 18 months
**Severity:** Significant (eats our top-of-funnel)

**Mitigations:**
- Klaviyo's product velocity in this space is slow (their last major IG
  push was Messenger lead-ads in 2021)
- They will not match the Launch Playbook IP for years
- Be acquired by them, or hit $30M ARR before they ship — both are
  acceptable outcomes
- The Klaviyo customer who churns to a bundled tool is the customer who
  doesn't care about IG-native UX; that's not our retained customer

## Class B — model / cost / quality death

### B1. Inference cost spikes; unit economics break

**What happens:** Anthropic prices increase, or our usage mix shifts
toward heavier Opus calls than projected, and Starter-tier margin goes
to zero or negative.

**Probability:** MEDIUM (the long arc is models get cheaper, but a single
quarter's pricing change is plausible)
**Severity:** Significant (forces a re-tier or model swap)

**Mitigations:**
- Hard cost-routing rules from day 1 (Opus only on first-of-thread +
  generation; Haiku on everything else)
- Per-tier reply caps with soft-cap-to-Haiku behavior
- Monitor inference cost / customer / month weekly; alert if any tenant
  exceeds 40% of plan price
- OpenAI failover available; secondary local model option longer-term
- Plan a 12-month inference budget; if it breaches, raise prices or
  tighten caps

### B2. Brand-voice fidelity is not differentiated enough

**What happens:** Even after the edit-history flywheel runs for 90 days,
founders can't tell our drafts from Manychat's. The whole moat narrative
breaks.

**Probability:** MEDIUM (this is the deepest technical risk)
**Severity:** Catastrophic (no moat = no pricing power)

**Mitigations:**
- D8 kill criterion: brand-voice edit-rate > 50% after 30 days → pivot
- Frontier model defaults (Opus 4.7) for tone-sensitive surfaces
- Aggressive QA on first 100 outputs per tenant — human review by us
- Per-vertical fine-tuning of the tone-card extraction prompt (streetwear
  hype voice vs quiet-luxury voice vs beauty educational voice)
- A/B comparison feature in the dashboard: "Manychat would have sent X;
  LaunchWings sent Y" so the value is visible to the founder

### B3. AI commoditization compresses the whole category

**What happens:** Foundation models converge to within 5% on tone
matching. Our brand-voice differentiation collapses into UX +
workflow, which is more easily copied.

**Probability:** MEDIUM-HIGH within 24 months
**Severity:** Significant (compresses moat → relies on Launch Playbook IP)

**Mitigations:**
- Launch Playbook IP is workflow / UX, not model — durable past model
  convergence
- Edit-history is still proprietary even if model differentiation collapses
- Compose multi-modal moats: workflow + edits + Shopify-native + Meta
  partner

## Class C — go-to-market death

### C1. Cold-start customer acquisition is too expensive

**What happens:** Reddit / Discord / cold email yields fewer than 10
design partners in 90 days; Shopify App Store review takes 6 weeks; our
CAC blows past LTV.

**Probability:** MEDIUM
**Severity:** Significant (kills Phase 1)

**Mitigations:**
- Founder-led outbound for the first 10 — accept high time-cost per logo
- Multi-channel: Reddit + Discord + Twitter/X + email + in-person at
  ComplexCon-style events
- Shopify App Store submission day 1 to compress review timing
- Free trial + Wave-0 pricing ($39/mo) lowers the bar to close
- Hard CAC ceiling: $200 blended CAC across Phase 1; if breach, pause
  paid and rework messaging

### C2. The streetwear / capsule-fashion TAM is smaller than projected

**What happens:** We saturate the streetwear vertical at $50K MRR and
the beauty/accessories expansion doesn't compound the way we modeled.

**Probability:** MEDIUM
**Severity:** Bounded (caps the bootstrap path; doesn't kill the company)

**Mitigations:**
- Vertical expansion built into the Phase 1.5 plan (month 4-6)
- Multi-channel expansion (TikTok Shop, WhatsApp) at year 2
- LATAM expansion via Spanish/Portuguese brand voice (Phase 2)
- If we cap at $50K MRR for 6 months running and growth-rate < 5%/mo,
  re-charter

### C3. Wave-0 design partners churn before paying $79

**What happens:** The 10 design partners on $39/mo lifetime-feeling
treatment don't convert to $79 at month 13. They demand the lower
price persist.

**Probability:** MEDIUM
**Severity:** Bounded (small absolute MRR impact, but signal)

**Mitigations:**
- Crystal-clear sunset terms in the design-partner agreement (NOT
  lifetime; documented as a 12-month alpha pricing window)
- Mid-window check-ins at month 9 to socialize the upcoming price change
- Offer 3-month bridge at $59 if a partner balks at the jump

## Class D — operational death

### D1. Meta Business Verification rejected; we can't go live

**What happens:** Meta rejects our verification (wrong category, missing
business docs, brand mismatch) and we're stuck in sandbox for weeks.

**Probability:** LOW-MEDIUM
**Severity:** Significant (delays alpha)

**Mitigations:**
- Verification filed Phase 0 (weeks 1-4) — well before customer dependency
- Brand site (launchwings.com) clearly describes the product; matches the
  app name
- Business docs ready (incorporation, EIN/equivalent, address proof)
- A Meta Solution Partner liaison on call if escalation needed

### D2. Founder bandwidth — solo / 2-person founding team

**What happens:** Founder burnout, illness, or other life event interrupts
the velocity we need to ship 6 features in 14 weeks.

**Probability:** MEDIUM
**Severity:** Significant

**Mitigations:**
- Scope is honest (6 features, 14 weeks, no scope creep)
- Use of Claude Code + agent tooling for execution leverage
- No customer commitments before Phase 1 readiness
- Honest exit option: if Phase 0 takes 8 weeks instead of 4, slide the
  whole plan, don't compress

### D3. Audit-log + data-privacy compliance miss before EU customers

**What happens:** A Spain/Brazil expansion hits a GDPR/LGPD audit and
we don't have the right consent flows, data-purge mechanisms, or audit
trails.

**Probability:** LOW-MEDIUM
**Severity:** Significant (regional fine, brand harm)

**Mitigations:**
- GDPR / CCPA day-1 design (consent flows, export, delete)
- Audit log per outbound from day 1
- SOC 2 Type I at $200K ARR or 50 customers (whichever first)
- LGPD review before Brazil go-live

## What we explicitly accept

Risks we know exist and accept without active mitigation:

- We accept that Anthropic could deprecate Claude Opus 4.7 in 12-18
  months. We will swap to the next-generation model when it ships.
- We accept that PWA-only (no native app) creates a notification-quality
  gap on iOS. We don't think it's worth native-app work in v1.
- We accept that we won't have multi-org / multi-seat / SSO in v1 — that
  may cost us 2-5 enterprise-curious leads. Fine.
- We accept that we will not pursue cross-tenant cohort benchmarks in v1.
  If at month 12 customers ask for it, we'll consider a privacy-preserving
  build then.

## Trip-wires (auto-pause spend / review)

If any of these holds for 2 consecutive weeks, the executive team pauses
new acquisition spend and runs a diagnosis:

- Meta API error rate > 3% rolling 7d
- Anthropic API error rate > 1% rolling 7d
- Average edit-rate > 60% across tenants
- Hot-lead conversion below baseline (no lift over self-replied)
- Monthly churn > 12% on rolling cohort
- CAC > $250 blended across all channels
