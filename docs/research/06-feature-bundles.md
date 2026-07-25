# Research Dossier 06 — Feature Bundles (User-Outcome Shaped)

*Source: parallel research agent, May 2026. Honest 2-engineer / 12-week sizing.*

> The roadmap's tickets are component-shaped (AG-04 Reddit Agent). Users buy outcome-shaped bundles ("I can launch on Reddit without getting banned"). This dossier regroups all work into 14 bundles.

## The 14 bundles, sized

| # | Bundle | Outcome | Effort (eng-weeks) |
|---|---|---|---|
| 1 | Tell us about your product | Sign up → Launch Brief in 5 min | 3.5 |
| 2 | Know what's broken | LRS Stage 1 + Fix-with-AI top 8 | 5 |
| 3 | Ready your launch story | Tagline + ICP + voice + brand kit locked | 2 |
| 4 | Generate launch artifacts | 6 artifacts in 90s, voice-scored, queued | 5 |
| 5 | Approve and schedule | Bulk approve, dependency scheduler, idempotent | 3 |
| 6 | Submit to directories | 30+ directories, RPA + API mix, status tracked | 6 |
| 7 | Launch day war-room | 5s dashboard, orchestrator, comment monitor | 4.5 |
| 8 | Compound after launch | pSEO + outreach + press + reviews + pricing A/B | 8 |
| 9 | Measure everything | Funnel + attribution + Insight Agent | 4 |
| 10 | Engagement loops | Morning brief + weekly report + streak | 2 |
| 11 | Pricing & monetization | Tiers + Stripe + BYOK + caps | 3 |
| 12 | Trust & safety | Monitor + audit + abuse detection | 2.5 |
| 13 | Build-platform partners | OAuth import for Lovable/Bolt | 6 |
| 14 | Free public tools + community | LRS audit, taglines, benchmarks | 4 |
| | **Total** | | **~58 eng-weeks** |

## Capacity math (the brutal truth)

**2 engineers × ~12 productive eng-weeks/month = ~24 eng-weeks in 12 calendar weeks.** The full surface is 58 eng-weeks. We can ship ~40% of it for public beta. Cuts must be brutal.

## Dependency graph (build order)

```
                  Bundle 1 (onboarding)
                         │
           ┌─────────────┼─────────────┐
           ▼             ▼             ▼
     Bundle 2       Bundle 3      Bundle 11
     (audit)        (story)       (pricing)
                         │
                         ▼
                  Bundle 4 (artifacts)
                         │
                         ▼
                  Bundle 5 (approve+schedule)
                         │
           ┌─────────────┼─────────────┐
           ▼             ▼             ▼
     Bundle 6       Bundle 9      Bundle 12
     (directories)  (analytics)   (trust)
                         │
           ┌─────────────┼─────────────┐
           ▼             ▼             ▼
     Bundle 7       Bundle 10     Bundle 8
     (warroom)      (engagement)  (compound)

Bundle 13 — extends Bundle 1, ship anytime after.
Bundle 14 — extends 1+2+9, ship after each is stable.
```

Critical path to demoable launch: **1 → 3 → 4 → 5 → 6 → 7**.

## MVP cut-line (Public Beta Week 12, ~24 eng-weeks)

- ✅ Bundle 1 — onboarding (3.5w)
- ✅ Bundle 2 — Stage 1 only (5w)
- ✅ Bundle 3 — story (2w)
- ✅ Bundle 4 — Landing + X + LinkedIn ONLY (3.5w of 5w)
- ✅ Bundle 5 — approve + schedule (3w)
- ✅ Bundle 6 — top 5 API directories ONLY, no RPA (2w of 6w)
- ✅ Bundle 11 — pricing + BYOK (3w)
- ✅ Bundle 12 — monitor only, no abuse detection (1.5w of 2.5w)
- **Total: ~23.5w** (tight; will slip slightly)

Beta story: "Sign up, get Launch Brief, fix what's broken, get content kit, schedule it, ship to 5 directories."

## Q2 (Weeks 13–24)

- Bundle 4 — Reddit + Email sequence (1.5w)
- Bundle 6 — RPA framework + 10 more directories (4w)
- Bundle 9 — Measure everything (4w)
- Bundle 7 — Warroom (4.5w)
- Bundle 10 — Engagement loops (2w)
- Bundle 2 — Stage 2 evaluators (~2w)
- Bundle 14 — 3 free tools (2w of 4w; benchmarks deferred)

## Q3 (Weeks 25–36)

- Bundle 8 — Compound (8w; this IS the quarter)
- Bundle 12 — Abuse detection (1w)
- Bundle 13 — Lovable + Bolt Level 2 (4w of 6w)
- Bundle 6 — Final 15 directory adapters (3w)
- Bundle 14 — Benchmarks + Open Launches (2w)

## Q4 (Weeks 37–48)

- Bundle 13 — Partners Level 3 (~2w)
- Bundle 2 — Stage 3 evaluators (~2w)
- AppSumo, SOC 2 Type I, scale, debt paydown.

---

## Dangerous lies in the current spec (must be fixed before launch marketing)

1. **"Build-platform OAuth integrations"** — Sprint 2 ships *subdomain regex + meta-tag detection*, not OAuth. True OAuth requires the partner to ship an OAuth provider; most haven't. Fix: rename to "auto-detect" everywhere, mark Level 3 as Q3+.
2. **"Founder voice fine-tunes stay platform-side — that's the moat"** (PRD F6) — we have RAG-over-embeddings, not fine-tuning. Fine-tuning is ~6 weeks of ML-Eng work we haven't scoped. Fix: rename to "Voice Match" via RAG; fine-tuning is a Year-2 moat.
3. **"30+ directory adapters"** — Sprint 3 has top-5; the other 25 are unscoped and burn all of Q3. Fix: be explicit "MVP = 5, Q2 = 15, Q3 = 30."
4. **"First-party attribution we own"** — depends on a JS snippet on the customer's site we haven't planned to ship. Today this is "your PostHog data, our agent reading it." Fix: either ship the snippet (Bundle 9 grows ~1w) or change the moat narrative to "best-in-class agent over your existing analytics."

These four corrections are a 1-day rewrite of marketing copy that prevent 6 months of "why doesn't it work like the demo?" support tickets.

---

## Critical wiring gaps surfaced by bundles

- **Lighthouse-in-container** for Stage 1 evaluator costs ~$0.05/run; nobody provisioned this.
- **SMTP-probe for "email capture works"** is dishonest — we can't actually test someone else's signup form e2e without breaking ToS.
- **Reddit sub-rule scraping** for top ~50 subreddits is an ongoing data-ops job nobody owns.
- **PH rank polling** at scale needs a shared poller with caching across all customers' launches; not designed.
- **Cold outreach via Smartlead** requires the customer's own warmed sending domain — a 1–2 week DIY task they have to do (not provided by us).
- **Apollo + Clay** are $100s/mo per customer; pricing model needs pass-through or absorb decision.
- **Timezone-aware cron** for per-tenant 6am Morning Brief at scale is non-trivial; naive impl spike-queues at hour boundaries.
- **k-anonymity (k≥50)** means cohort benchmarks are dark for the first 6 months (<50 launches/cohort). Need "loading until we have signal" state, not fake data.
- **Custom-domain analytics on Scale tier** = real DNS + cert mgmt feature nobody scoped.
- **Hash-chain audit verifier** exists in CI but isn't run in prod periodically; add daily cron.

---

## Gaps not in current roadmap (must add)

1. **Paid acquisition for the user** (Google/Meta/Reddit Ads) — Q3 candidate.
2. **Integrations marketplace** (third-party connectors) — Q4.
3. **Agency / multi-client mode** — Year 2 ($300+/seat segment).
4. **Refund / dispute / chargeback flow** — hits at customer ~30.
5. **Customer support tooling** (Intercom/Plain) — month 3.
6. **GDPR right-to-erasure UX** — promised but no ticket.
7. **Email deliverability dashboard per tenant** — DMARC/DKIM/spam-rate monitoring.
8. **OAuth token rotation/refresh monitoring** — connectors silently expire today.
9. **PWA install nudge** — promised but not built.
10. **Translations pipeline** — extract strings now even if v1 is EN-only.
11. **Content moderation appeals** — monitor-blocked drafts need user-appeal flow.
12. **Cohort cold-start state** — first 6 months have <50 launches/cohort.
13. **Sandbox / test mode** — #1 free-tier conversion blocker; lets users do a dry-run launch without burning their Free slot.
14. **Per-tenant cost observability for US** — identify abusive Free users before they bankrupt us.
15. **Voice fine-tuning** — either build ~6w of ML-Eng or change the moat narrative.

---

## Kill list (cut or defer)

| # | Item | Verdict |
|---|---|---|
| 1 | AG-12 Influencer/Creator Outreach | Defer Q4 — high-touch, poor agent fit, users want CRM not generator |
| 2 | AG-14 Competitor Intel | KILL from MVP — Google Alerts substitutes; Year 2 |
| 3 | AG-13 Pricing Page Optimizer | Defer — needs traffic our users don't have |
| 4 | PAY-07 Outcome-based add-on ($0.50/signup) | Defer Year 2 — disputes eat margin |
| 5 | PARTNER-03/04/05 (v0/Replit/Paperclip/Pickaxe) | Defer Q4+ — Lovable + Bolt first |
| 6 | BMK-02 Open Launches public leaderboard | Defer Q3+ — cold start, low-quality risk |
| 7 | SCALE-01 AppSumo LTD | Defer — support burden, LTV risk at <500 paying |
| 8 | SCALE-02 SOC 2 Type I | Readiness yes, audit no until 50 paying ask |
| 9 | GA-04 Affiliate program | Defer Q3 — affiliates without PMF = churny signups |
| 10 | GA-05 "10 free tools" | Cut to **3** for MVP (LRS audit, tagline gen, hunter finder) |
| 11 | CN-09 Bluesky | Defer — tiny SaaS-founder audience |
| 12 | Custom-domain analytics on Scale | Year 2 — 5% of customers, real DNS+cert work |
| 13 | Voice "per-channel tone variation" | Cut for MVP — single voice |
| 14 | SETUP-13 Mintlify docs | Defer Q2 — README sufficient for beta |
| 15 | Stage 3 Checklist (31 items) | Defer Q4 — most users won't reach Stage 2 anyway |

## Two languages

> The bundles in this memo are the units a user actually buys. The tickets in the roadmap are the units we actually build. Plan in the first, execute in the second, report progress in *both*.
