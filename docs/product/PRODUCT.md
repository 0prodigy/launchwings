# Product Operating Spec

*How the system runs day-to-day. The PRD describes what we build; this
describes what happens when the customer uses it. Read after [VISION](VISION.md)
and [PRD](PRD.md).*

## System actors

- **Tenant** — one paying account, one Shopify store, one IG business
  account, optionally one FB Page. Scale tier allows up to 3 brands per
  account (each with its own corpus).
- **Founder user** — the human running the brand. Owns the tenant.
- **AI agent (LW)** — the system. Three roles: drafter, sender, surveyor.
- **Meta Graph API** — auth + IG/FB DM + comments + posts.
- **Shopify API** — products, orders, customers, abandoned checkouts.

## Lifecycle of a tenant

### T0 — Signup (60 seconds, mobile)
1. Email + password (Clerk) — no SSO in v1.
2. Plan picked (Starter / Growth / Scale), card on file (Stripe).
3. Connect IG Business / FB Page (OAuth, Meta Graph).
4. Connect Shopify store (OAuth).
5. Land on the **First Drop wizard** (T1).

### T1 — First Drop wizard (8 minutes)
1. **Ingest** — backend pulls last 100 IG captions, 50 product descriptions,
   last 50 DM threads (with founder consent), FB Page posts. Status bar.
2. **Tone preview** — Opus 4.7 derives tone card; shows founder 3 sample
   captions in the inferred voice; founder picks "feels right" / "tune it"
   / "starts over." Tune-it shows sliders (hype, formality, emoji).
3. **Schedule a drop** — founder picks one of: Drop / Restock / Capsule /
   Flash Sale / Pre-order. Sets target date.
4. **Preview the playbook** — every beat is drafted; founder swipes through
   captions, edits inline, taps approve-all or approve-per-beat.
5. **Configure auto-handle** — toggle which DM intents the AI handles
   without approval (shipping = on by default, pricing = off by default).
6. **Live** — wizard exits to Dashboard. Tenant is now active.

### T2 — Steady state (always-on, drop-driven)
Daily background jobs:
- Edit-history → tone-card refresh (3am UTC)
- Corpus re-embedding (delta only)
- Hot-lead score model retrain (weekly)
- Account-health check (Meta API liveness, Shopify connection, Stripe)

Drop-driven foreground:
- T-7d through T+3d for any scheduled launch, beats fire on schedule;
  inbound DMs handled per per-thread mode; hot leads surface to founder.

### T3 — Renewal / expansion
- 14-day free trial expires → card billed.
- Monthly billing cycle. Soft-cap warnings sent at 80% of reply quota
  and at 100% (Haiku-only-mode kicks in at 100%).
- Upgrade path: in-app upsell when founder hits cap twice in 60 days.

### T4 — Churn (graceful)
- Founder cancels → next-cycle stop, immediate downgrade to read-only.
- 30-day soft-delete window: corpus retained, AI replies disabled, founder
  can resubscribe in one tap.
- After 30 days: corpus exported (founder consent) and purged.

## Lifecycle of a launch

The Launch Playbook engine is a finite state machine per launch instance.

```
[draft] → [scheduled] → [pre-launch active] → [drop hour]
       → [live launch] → [post-launch urgency] → [recap]
       → [archived]
```

Each transition fires `LaunchEvent` rows in Postgres and (where
applicable) creates Trigger.dev scheduled tasks.

### Beat fires
1. Trigger.dev task wakes at `publish_at`.
2. Loads beat-draft from DB (already approved by founder).
3. Calls Meta Graph API to publish (IG post, reel, story, FB Page post,
   or send DM).
4. Writes audit log row with `(tenant_id, launch_id, beat_id, channel,
   payload_hash, status, ts, meta_response_id)`.
5. If error: exponential backoff, max 3 retries, then alert founder.

### Inbound DM during launch
1. Meta sends webhook → `apps/api` receiver.
2. Load thread context + corpus retrieval.
3. Classify intent (Haiku): shipping / sizing / pricing / hot-lead / other.
4. Route by per-tenant config: auto-handle (Opus first reply, Haiku follow-ups)
   / founder-approve (Opus draft, queue for approve) / hot-lead (surface).
5. Generate response (Opus if first-of-thread or hot, Haiku if follow-up).
6. Founder edits if not auto-handle; tap approve.
7. Send via Meta Graph API. Audit log row.
8. Capture (draft, edited, founder_action) for tone-card learning.

### Hot lead surfacing
1. Composite score crosses threshold → mark thread `hot=true`.
2. Push notification to founder mobile PWA.
3. Thread appears top-of-Hot-Lead-Inbox.
4. Founder opens → thread + Shopify order history + corpus context loaded.
5. Founder replies personally.
6. Founder marks won/lost on close → feeds back into scorer.

## Modes

**Approval modes (per-thread, configurable):**
- `auto` — AI sends without approval, only for allow-listed intents.
- `approve` — AI drafts, founder approves before send.
- `manual` — AI doesn't draft; founder replies in-app.

**Operational modes (per-tenant):**
- `normal` — all features on.
- `paused` — no outbound. Inbound still captured. Founder triggers manually.
- `cap-reached` — exceeded monthly reply quota; AI routes everything to
  Haiku, banner shows in dashboard, no hard stop.
- `incident` — Meta API rate-limit hit / account flagged; outbound paused
  globally; founder alerted; safety pipeline review.

## Safety pipeline (every outbound passes through)

1. **24-hour window check** — outbound to a user only if they messaged us
   within 24h, OR the outbound is a system-tag (order status,
   shipping) that Meta allows. If neither holds, refuse.
2. **Brand-policy check** — short LLM check against tenant's banned-phrases
   list + global anti-spam lexicon. Flagged → founder review.
3. **Content-class check** — no medical / financial / legal advice; no
   bulk-promo language outside conversational context.
4. **Rate cap** — per-tenant Redis token bucket. Conservative defaults
   (e.g., max 1 outbound per IG thread per 10 minutes).
5. **Audit log row** — every outbound, before send.

If any check fails: refuse + log + notify founder. Never silently mutate.

## Channel partners

- **Meta Graph API** — primary surface. Day-1 access via standard Business
  Verification. Month-3 submission for Meta Tech Partner status (priority
  API, beta features).
- **Shopify** — App Store listing month 2. Distribution flywheel.
- **Stripe** — billing only (subscriptions). No Connect, no application
  fees, no take-rate. Killed.

## Data ownership

- **Customer data** — every tenant owns their corpus + edit history.
  Exportable at any time as a JSONL bundle.
- **Cross-tenant aggregates** — none in v1. We do not anonymize and pool
  the way the original LaunchWings did. Each tenant's flywheel is
  self-contained. (No cohort warehouse, no differential privacy, no
  cross-tenant benchmarks.)
- **Model training** — no customer content used to train shared models.
  All per-tenant prompts and retrieval. Document this explicitly in
  Terms.

## Observability

- **Logs** — structured JSON, Vercel + custom shipper to log store.
- **Metrics** — PostHog for product analytics; Sentry for errors; custom
  audit log in Postgres for every outbound.
- **Founder-facing dashboard** — Brand-voice edit-rate over time,
  auto-handle rate, hot-lead conversion, monthly reply count vs cap.
- **Internal dashboard** — North star (drops/month/customer), kill-criteria
  trip-wires, Meta API ban rate, cohort retention.

## Cost routing rules

Hard rules enforced by `apps/api`:
- Brand-voice ingestion → Opus 4.7
- Tone-card refresh → Opus 4.7
- Launch Playbook beat generation → Opus 4.7
- DM first-message-of-thread draft → Opus 4.7
- DM follow-up message draft → Haiku 4.5
- Intent classification → Haiku 4.5
- Hot-lead scoring → Haiku 4.5
- Bulk routing / safety checks → Haiku 4.5

Over the soft cap: every Opus call falls back to Haiku.

## What can break and how we recover

- **Meta API outage** — outbound queues in Trigger.dev; dashboard banner
  shows degraded mode; founder is notified.
- **Shopify API outage** — order-status DMs delay; everything else fine.
- **Anthropic API outage** — failover to OpenAI; quality drop noted in
  the audit log but service continues.
- **Tenant exceeds rate cap** — softcap to Haiku, never hard cutoff.
- **Founder account flagged by Meta** — auto-pause outbound, alert
  founder, support reach-out within 4 hours.
