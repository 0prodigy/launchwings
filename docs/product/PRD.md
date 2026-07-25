# Product Requirements Document

*Build-target spec. Read in order: [VISION](VISION.md), this doc,
[PRODUCT](PRODUCT.md) (operating spec), [COMPETITIVE](COMPETITIVE.md),
[ROADMAP](../operations/ROADMAP.md), [PRICING](../brand/PRICING.md),
[Charter](../operations/CHARTER_2026_05_14.md).*

## What we're building

A multi-tenant SaaS that runs the daily and launch-day work for an
Instagram + Facebook native product brand. Six features ship as the MVP;
the operating model is "AI does the volume, founder approves the
critical, hot leads surface to the founder."

Three plug-points (year 2):
- Shopify App distribution
- Meta Tech Partner integration
- Optional MCP server for AI-coding-canvas users

Three defensibility layers:
- **Per-customer corpus + learn-from-edits flywheel** — RAG over each
  tenant's past content + DMs + edits. Compounds monthly. Non-portable.
- **Launch-playbook IP** — orchestration sequences for drop / restock /
  capsule / flash sale / pre-order that no incumbent owns.
- **Shopify-native depth + Meta Tech Partner status** — Manychat lost
  Shopify-native; we win it back.

## Out of scope (v1)

- TikTok Shop (year 2)
- WhatsApp Business (year 2; LATAM)
- Email / SMS channels (Klaviyo and Postscript own these)
- Multi-brand agency seats (Scale tier handles up to 3; agency tier is post-v1)
- Native mobile app (PWA is enough)
- Self-serve enterprise / SSO / SAML
- Building the customer's product or storefront
- Deploying the customer's site

## Core features (the six)

### F1 — Brand-Voice Engine

**Ingest:**
- Last 100-200 IG captions via Meta Graph API
- Last 50-100 customer-DM threads (with founder consent) via Meta Graph API
- Product titles, descriptions, FAQs from Shopify Storefront API
- Optional: brand website "About" page, last 20 newsletter blasts
- FB Page posts (same auth)

**Store:**
- Per-tenant pgvector store, embeddings via Anthropic embedding endpoint
  (or open-source `bge-large-en-v1.5` as failover)
- Per-tenant "tone card" — JSON structured profile (formality 1-10,
  hype-level 1-10, emoji density, sentence-length distribution, common
  phrases, banned phrases) extracted by Claude Opus 4.7 from the corpus

**Use:**
- Every generation prompt assembles: tone card + retrieved top-k snippets
  from the corpus + the situation context (e.g., "answer a sizing
  question for product X")
- Output goes to the founder for approval before send, except in
  auto-approved modes (see F3)

**Learn:**
- Every founder edit on a generated draft is captured as `(original_draft,
  edited_draft, founder_id, situation, timestamp)` rows in Postgres
- Daily batch job re-derives the tone card from accumulated edits
- Edit-weighted retrieval: corpus snippets that were edited heavily lose
  retrieval weight; snippets that founders approved unchanged gain weight

**Acceptance (the canonical edit-rate definitions used in all docs):**

- **Edit-rate** = % of generated drafts the founder modified before
  approving, measured as `count(drafts_edited) / count(drafts_total)`
  on a rolling 7-day window. Edit-distance (`Levenshtein / len(original)`)
  is a secondary signal but the headline metric is binary edit-or-not.
- **Day-1 baseline** for a new tenant: 60-75% edit-rate during the first
  7 days of use (the corpus has just been ingested, the tone-card is
  uncalibrated).
- **Day-30 target curve:** baseline drops to 35-45% by day 30 (corpus +
  edit-feedback has run for a month). Phase 1 (months 0-3) cohort exit
  criterion: cohort median ≤ 45% at day 30.
- **Day-90 target curve:** ≤ 30% by day 90.
- **Hard kill criterion (D8 / Pre-mortem):** if the cohort-median
  edit-rate is > 50% at day 30 after Phase 1 GA, F1 has failed and the
  moat narrative is broken — we re-charter.

### F2 — Launch Playbook

**Pre-built sequences (templates):**
1. **Drop** — pre-launch tease (7d, 3d, 1d, 12h), reveal (drop hour),
   urgency (4h, 12h, 24h, 48h), sold-out / restock-soon, recap (day-3).
2. **Restock** — alert (1h before), live, low-stock urgency (10/30/50
   units left), sold-out.
3. **Capsule Launch** — 3-piece reveal (one product per day), full collection
   live, lookbook recap.
4. **Flash Sale** — countdown (24h, 6h, 1h), live, hourly urgency, end.
5. **Pre-order** — announcement, mid-window check-in, last-call, ship-date
   update.

**Per beat:**
- Caption + 1-3 image/video slot suggestions (founder uploads media)
- Hashtag set (extracted from tone card + IG hashtag intelligence)
- DM-autoreply ruleset for the beat (e.g., during pre-launch, DMs asking
  "when does it drop" get the answer in voice)
- Comment-to-DM trigger keywords for the beat
- Scheduled `publish_at` timestamp; founder can edit timing
- All drafts shown to founder before any beat goes live; one-tap approve

**Acceptance:**
- A founder can configure a Drop sequence from scratch in < 5 minutes
  on mobile.
- A founder running a 4-launch month sees at least 3 of those launches
  routed through Launch Playbook (D8 kill: < 50% monthly is failure).

### F3 — DM + Comment Engagement (IG + FB)

**Channels:**
- Instagram DM (incoming + outgoing)
- Instagram comments on posts/reels (incoming + outgoing reply or DM)
- Instagram Stories reply (incoming → DM thread)
- Facebook Page DM (incoming + outgoing)

**Modes (per-thread):**
- **Auto-handle** — AI replies without founder approval. Available only
  for "safe" intents: shipping status, sizing questions answered by
  knowledge base, FAQ, polite acknowledgment. Configurable allow-list.
- **Founder-approve** — AI drafts, founder taps approve. Default for
  product-specific Qs and pricing.
- **Hot-lead** — AI detects high purchase intent → routes to F5.

**Compliance:**
- 24-hour Meta messaging window — strictly enforced. No outbound after
  24h unless user re-engages.
- Never bulk DM. Outbound is only in response to inbound or to existing
  thread participants within the window.
- All comment-to-DM triggers are keyword-based on user comments (the
  IG-standard "comment SHOP for the link" pattern), not unsolicited.
- All thread state stored per-tenant; founder can pause auto-handle for
  any thread or globally.

**Acceptance:**
- Average DM response time < 5 minutes during a live drop.
- Auto-handled threads have a < 5% complaint rate (measured by founder
  reverting an auto-reply or marking as wrong).
- Zero Meta-API ban incidents in Phase 1 (10 customers, 90 days).

### F4 — Shopify-Native Connector

**Pulls from Shopify (read):**
- Products (catalog, variants, inventory, descriptions, images)
- Orders (status, tracking, customer)
- Customer (email, opt-in status, prior orders)
- Abandoned checkouts

**Pushes to Shopify (write, optional):**
- Customer note (when a hot-lead conversation ends in a sale)
- Order tags ("dm-attributed")

**Triggers:**
- Order placed → DM the customer "thanks + here's your tracking" in voice
  (Meta-allowed system-tag outbound, no 24h-window restriction)
- Order shipped → DM tracking link in voice (same — system-tag allowed)
- Abandoned checkout → DM nudge in voice — **only** if the customer has
  an active DM thread with the brand within the Meta 24h window. We do
  NOT do unsolicited abandoned-cart DMs (that would violate Meta policy
  and trigger ban risk). Coverage is honest: this trigger fires for
  approximately 10-25% of cart abandons (the subset who DM'd the brand
  about the product before adding to cart). For the other 75-90%, we
  surface the abandon in the **Hot-Lead Inbox** for founder-initiated
  outreach via Story reply or comment, which is compliant.
- Restock event → trigger Restock Playbook beat-1
- Cart-abandon → Hot-Lead Inbox surfaces the customer profile (with
  prior cart contents) for the founder to engage manually through a
  compliant channel

**Acceptance:**
- Order events appear in DM thread within 60 seconds of Shopify webhook.
- Abandoned-checkout DM lifts checkout completion by ≥ 10% vs control
  (measured against tenants who don't enable this trigger).

### F5 — Hot-Lead Inbox

**Detection signals (composite score):**
- Multiple DMs in same thread (≥ 3 in 24h)
- Mentioned specific SKU + sizing
- Profile signals (verified, follower count, has bought before)
- Sentiment + intent classifier (Claude Haiku, cheap)
- Time-of-engagement (during a live drop > non-drop)

**Surfacing:**
- Dashboard inbox tab, sorted by score
- Push notification on mobile PWA
- Daily 5pm digest email summarizing the day's hot leads

**Founder action:**
- Tap → reply personally with full thread + corpus context loaded
- Mark as won / lost → feeds back into the lead-scoring classifier

**Acceptance:**
- Founder personally replies to ≥ 60% of hot-lead-surfaced threads.
- Hot-lead-replied threads convert to Shopify orders at ≥ 2× the
  baseline DM-to-order rate (measured weekly).

### F6 — Launch Dashboard (mobile-first PWA)

**Single screen during a live launch:**
- Top: launch state (which beat is live, next beat ETA, what's queued)
- Posts going out (timeline view, edit / pause buttons)
- DMs flowing in (rolling feed, with auto-handle / awaiting / hot-lead labels)
- Hot leads queue (count + tap-to-open)
- Revenue live (Shopify orders since launch start, attributed via UTM
  + DM-thread match)

**Non-launch view (always-on):**
- Yesterday summary
- Current week's scheduled launches
- Brand-voice quality score (rolling edit-rate %, trend)
- Account health (Meta API status, Shopify connection, billing)

**Constraints:**
- PWA installable, full mobile-first design
- No desktop-only features in v1
- All actions reachable in 2 taps from the home screen

## Non-functional requirements

- **Performance:** dashboard p95 < 1.5s on 4G mobile; DM reply generation
  p95 < 3s; launch beat publication exactly at scheduled timestamp
  (≤ 30s drift).
- **Reliability:** durable retries on Trigger.dev for every outbound;
  at-least-once with idempotency on DM send (use Meta's `client_message_id`).
- **Security:** per-tenant RLS in Postgres; OAuth tokens envelope-encrypted
  at rest (AWS KMS or libsodium); audit log row per outbound `(tenant_id,
  channel, thread_id, payload_hash, model, mode, ts, status)`.
- **Cost:** ≥ 50% gross margin on Starter assuming 5K AI replies/mo + 4
  launches/mo (see PRICING.md unit-economics model).
- **Compliance:** GDPR + CCPA day 1. Meta Business Verification before
  alpha. Meta Tech Partner submission by month 3. SOC 2 Type I begins at
  ≥ 50 paying customers or $200K ARR, whichever first.

## Success metrics

Single source of truth: **drops successfully run by LaunchWings customers
in the last 30 days, weighted by DM-attributed Shopify revenue.**

A drop is "successfully run" when ALL of these hold:
1. The Launch Playbook completed at least 80% of its scheduled beats
   without errors blocking publication.
2. The founder approved ≥ 70% of generated drafts unchanged or with
   minor edits (edit-distance < 30% per draft).
3. At least one Shopify order was attributable to a DM thread or
   comment-to-DM funnel initiated during the launch window
   (T-7d through T+3d).
4. No Meta API ban / rate-limit incident occurred on the brand's
   account during the launch window.

A drop that fails any one of (1)-(4) is counted as a "run drop with
issues" and excluded from the North Star until the issue is resolved
in the next cycle.

Leading indicators tracked from day-1:

| Metric | 90-day target | 12-month target |
|---|---|---|
| Paying customers | 10 | 250 |
| Median launches/customer/month | 2 | 4 |
| Brand-voice edit-rate (lower better) | 70% → 45% over 90d | < 30% |
| Auto-handle rate of incoming DMs | 30% | 60% |
| Hot-lead → Shopify order conversion (vs baseline) | 1.5× | 2.5× |
| Meta API ban incidents (rolling 90d) | 0 | < 1% of customers |
| Monthly churn | < 12% | < 5% |
| Net revenue retention | breakeven | ≥ 110% |
| MRR | $1,500 | $30K-$50K |
| Shopify App Store rating | 4.6+ stars | 4.8+ stars |

## Kill criteria

If any of these hold after the named window, we pivot:

- < 10 paying customers after 120 days of GA → wedge messaging is wrong.
- ARPU < $79 after 6 months → pricing is wrong.
- Launch-Playbook usage < 50% of customers monthly → F2 is wrong.
- Brand-voice edit-rate > 50% after 30 days of customer use → F1 has
  failed; moat narrative breaks.
- Meta API ban rate > 2% of customers in any quarter → F3 safety pipeline
  failed.
- Churn > 8% monthly after month 6 → product-fit is wrong.

## Glossary

- **F1–F6** — Brand-Voice Engine / Launch Playbook / DM+Comment Engagement
  / Shopify Connector / Hot-Lead Inbox / Launch Dashboard.
- **Tone card** — JSON-structured per-tenant voice profile derived from
  corpus by Opus 4.7; refreshed daily from accumulated edits.
- **Corpus** — per-tenant store of captions, DMs, product copy in pgvector.
- **Beat** — one step in a Launch Playbook sequence (e.g. "tease-day-3").
- **Edit-rate** — % of generated drafts the founder modified before
  sending, rolling 7d. Inverse of brand-voice quality.
- **Hot lead** — DM thread scored above the configurable threshold for
  manual founder reply.
- **Auto-handle** — AI sends without founder approval, only for allow-listed
  intents.
- **24h window** — Meta's messaging policy restricting outbound to a
  24-hour window after user engagement. Non-negotiable.
