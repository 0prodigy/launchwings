# Research Dossier 10 — Years 2–3 Expansion Roadmap

*Source: parallel research agent (Head of Product), May 2026.*

> The MVP solves "I built it → I launched it." Year 2–3 must move us from launch concierge to **always-on growth operating system for solopreneurs**, while opening a second wedge into agencies and a third into AI-build-platform-embedded distribution. Target: **$1.4M–$1.8M ARR by month 24, $3–4M by month 36.**

## 13 expansion areas (priority order)

### 1. AdsLoop — paid advertising orchestration (Q3 Year 1)

A 17th specialist agent. Takes Launch Brief + Founder Voice + ICP and orchestrates paid acquisition across Meta, Google, Reddit, LinkedIn, X, YouTube, TikTok.

**Per-platform realities (May 2026):**
- **Meta Marketing API**: Standard access requires Business Verification + App Review. May 2026 update lowered threshold from 1,500 to 500 calls in 15 days, error rate <15%.
- **Google Ads API + Performance Max**: Developer token + OAuth + MCC account. Basic auto-granted, Standard requires application.
- **Reddit Ads API**: OAuth 2.0; commercial usage gated.
- **LinkedIn Campaign Manager API**: `rw_ads` scope; Development tier read-only unlimited / edit 5 ad accounts; Standard requires application.
- **X Ads API**: bundled into Pro/Enterprise tiers ($5K/mo+); start with X organic only, ship X Ads in Q4 only if Pro tier ROI clears.
- **YouTube + TikTok Ads**: 2–4 week approval cycles.

**Solopreneur guardrails (where competitors fail):**
- Hard daily spend cap workspace-level. Default $25/day Pro, $100/day Scale.
- Per-launch lifetime cap $500 unless explicitly raised twice (double-confirm + Stripe-level secondary auth on >$1K).
- CAC ceiling auto-pause — agent computes blended CAC every 6h; if CAC > 3× plan price for 24h, auto-pause and notify.
- Reversibility classifier — pause is reversible, scale-above-cap requires approval.
- Creative review queue — Monitor model + one-tap founder approve.

**Pricing**: Add-on **$39/mo** OR included in new **Growth tier $79/mo** between Pro and Scale. Optional ad-spend markup of 5% over $500/mo (capped $100/mo). Sits below Madgicx ($99/mo+).

**Effort: L (8 eng-mo). Cannibalization: Low. Ship: Q3 Y1 (Meta + Google first), Reddit + LinkedIn Q4, TikTok/YouTube Q1 Y2.**

### 2. RetentionLoop — light CRM + lifecycle (Q1 Year 2)

Launch-aware light CRM: contacts + deals-lite + notes + timeline + embedded NPS + lifecycle email + churn-risk scoring. Deep integrations with HubSpot/Pipedrive/Attio for users who already have a CRM.

Reference pricing: Customer.io Essentials $100/mo (5K profiles, 1M emails); ChurnZero $10.7K–$180K/yr; Vitally custom-quote. **All these skip our ICP** (built for CS *teams*, not solo founders). That's our wedge.

**Pricing**: Bundled into Pro ($49) and Scale ($129) at <500 customers tracked. Above that, **+$29/mo "RetentionLoop" add-on** lifting cap to 10K. 70% below Customer.io.

**Effort: M (5 eng-mo). Most plumbing exists; new build is health-score model + NPS embed + 4 CRM tables.**

### 3. Marketplace / Integrations directory (Q3 Year 2)

Third parties build extensions: directory submitters, niche social platforms, lifecycle templates, custom agent skills. Slack/Linear app directory pattern.

- **Revenue share**: 70/30 in builder's favor for paid extensions; free extensions free. Stripe Connect payouts.
- **Curation**: hybrid — open submissions for free read-only integrations; full review + signed manifest for write/spend extensions. Mirror Slack/Notion OAuth verification pattern.
- **Risks**: security (sandbox runtime, scoped tokens, per-extension spend cap, mandatory audit log); brand (ratings, "Verified by LaunchWings" tier, auto-disable on >2% error rate); cannibalization acceptable (we take 30% on their revenue).

**Don't ship until ≥3,000 paying users.** Marketplaces are demand-side density functions.

**Effort: L (10 eng-mo). Ship: Q3 Y2.**

### 4. Agency / multi-client mode (Q4 Year 1)

Workspace switcher (parent agency org → child client orgs), RBAC, white-label (custom subdomain, logo, email-from-domain), per-client billing.

This *contradicts* current Anti-ICP ("we say no to agencies") in VISION.md. Year-2 reality: small launch-marketing boutiques (LaunchDirectories-style $200–500/campaign VAs from research/01) become **resellers of LaunchWings**. We get distribution; they get 70% margin instead of 100% labor cost.

**Pricing**: **$299/mo for 10 clients, $499/mo for 25, $999/mo unlimited**. White-label, agency logo, agency-branded reports. Sits between Scale ($129) and Premier (#12).

**Effort: M (5–6 eng-mo). Multi-tenant RLS already exists; extending to parent-child is the lift.**

### 5. API + custom agents SDK (Q2 Year 2)

Three layers:
1. Public REST API (read-only first; write later). Rate-limited: 1K calls/day Pro, 10K/day Scale.
2. Custom skills SDK (TypeScript, sandbox runtime).
3. Webhook + MCP server — user's Claude/Cursor/Lindy can read LaunchWings data and trigger actions.

**Cannibalization risk: Medium.** Power user might build their own Cold Outreach Agent and cancel Pro. Mitigation: keep Founder Voice fine-tunes platform-side; SDK can call but not extract.

**Pricing**: API on Pro/Scale. SDK on Scale only. **Developer add-on $19/mo** for higher rate limits.

**Effort: L (9 eng-mo). Ship after marketplace foundations (#3).**

### 6. Investor signaling layer — "LaunchWings Capital" (Q2 Year 2)

Once a launch hits a threshold ($5K MRR, 500 customers, retention curve flattening), opt-in to surface to curated investor list. Three formats: anonymized cohort feed, named "graduating cohort" weekly digest, live data-room export (one-click Stripe + LaunchWings attribution + retention).

**Partners not competitors:**
- Mercury Raise: partnership ($5B valuation rumored). They serve funded startups; we feed them pre-seed graduates.
- Failory: cross-promote, minor competitor for attention.
- Crunchbase: Enterprise API ($49–999/mo) — paid data deal.
- AngelList/RUV/Stack: syndicate formation partnership.

**Pricing**: Free for users (benefit). Revenue from investor side: **$499/mo investor seat** on curated feed.

**Effort: M (4 eng-mo).**

### 7. GEO — Generative Engine Optimization (Q3 Year 1, fast win)

The SEO Agent must evolve. Programmatic SEO still matters for Google AI Overviews. Bigger shift is being cited by ChatGPT, Perplexity, Claude, Gemini AI Search.

GEO Agent continuously: prompts major models for category queries ("best launch tool for solopreneurs"), measures share-of-voice, drafts content + structured data designed for LLM ingestion.

**Reference pricing**: Profound $499+/mo enterprise; Goodie AI $495+/mo; Otterly $29/mo (10 prompts); Peec.ai €85–89/mo (50 prompts).

**Pricing**: Bundled into Scale ($129); add to Pro for **+$19/mo**. Otterly-tier capability at no extra cost is huge differentiator.

**Effort: S (2 eng-mo). Highest-leverage cheap-to-build expansion. Ship within 90 days of MVP.**

### 8. Voice / podcast distribution (Q4 Year 1)

NotebookLM-style auto-generated 5–10 min episode pitching the founder's product. Distribute to Spotify/Apple/YouTube Music via RSS we host. Auto-pitch to podcast hosts via Listen Notes API ($30–180/mo). Repurpose into 60-sec audio teasers for LinkedIn/X.

**Pricing**: Included in Pro+ as perk. ElevenLabs costs covered by managed credits.

**Effort: S (2–3 eng-mo).**

### 9. Video distribution — Shorts/Reels/TikTok (Q1 Year 2)

From founder's product demo (Loom uploaded once during onboarding), generate 5–10 short-form clips/week. Auto-post to TikTok/IG Reels/YouTube Shorts (TikTok 15/day cap, IG ~25, YT ~6).

**Buy/integrate, don't build.** Submagic Pro $40/mo, Agency $80/mo. Opus Clip Starter $9/mo.

Year 2: pass-through integration + post scheduler. Year 3: vertical-integrate by fine-tuning Haiku-driven cuts on our 100K+ launch corpus.

**Effort: M (4 eng-mo).**

### 10. Localization (Q4 Year 2)

Translate landing artifacts + copy variants + directory submissions into JA/KO/ZH/HI/PT/ES/FR/DE. Auto-discover and submit to per-geo directories. Per-region compliance: GDPR ✓, LGPD (Brazil), PIPEDA (Canada), India DPDPA (Sept 2025 enforcement).

**Pricing**: **+$19/mo "Global" add-on** for any tier above Starter, OR new geographic Scale-Global tier at $179.

**Effort: L (8 eng-mo). Defer until Year 1 proves $500K ARR.**

### 11. Embedded SDK — THE moat (Q1 Year 2)

"Add LaunchWings to your build platform." Lovable/Bolt/v0/Paperclip/Replit embed our flows directly via iframe + post-message protocol. Founder clicks "Launch" inside Lovable; LaunchWings's checklist + onboarding renders embedded; OAuth flows back via Lovable; we run the launch and report back into Lovable's dashboard.

**Reference patterns**: Stripe Connect Embedded Components (drop-in components, signed JWTs, partner-themed UI), Plaid Link (iframe + post-message handshake), Auth0 Universal Login (redirect flavor).

**Per-partner customization**: theme tokens, partner-branded copy, optional **15% subscription revenue share** to partner on referred users.

**Effort: L (9 eng-mo). Cannibalization: NEGATIVE — embedding deepens lock-in with partner AND us simultaneously. Ship Q1 Y2 but start partnership conversations Q3 Y1.**

### 12. Premier / Concierge tier — done-for-you (Q2 Year 2)

**$2,500–$10,000 per launch.** Human launch ops + LaunchWings tools.

- **Premier Standard $2,500** — 1 launch, 1 ops person, 30 days
- **Premier Plus $5,000** — + PR push + journalist intros
- **Premier Elite $10,000** — full-quarter campaign, 4 launches' worth

**Margin math**: LaunchWings-trained ops can run 4–6 concurrent launches. $120K/yr loaded cost × 5 launches × $5K avg = $300K/headcount. **60% gross margin** on the human + we eat $25–50/launch AI/tool COGS.

**Effort: S (1 eng-mo for tooling) + ops hiring.**

### 13. Acquisition / partnership opportunities

**Who could acquire us:**
| Acquirer | Reason |
|---|---|
| **Mercury** | Adjacent funnel — top-of-funnel for Mercury Raise + Treasury |
| **HubSpot** | Down-market PLG wedge they structurally can't build |
| **PostHog** | Already $30M ARR; locks attribution narrative |
| **Build platform** (Vercel/Lovable/Bolt) | Vertical capture of solopreneur — most likely buyer |
| **ProductHunt** | Defensive — partnership-then-acquire |
| **Stripe** | Owns Indie Hackers; LaunchWings is orchestration above IH |

**Who we could acquire (Y2-3 with Series A):** small directory with DR≥80, free tool with high traffic ($200K–$500K), creator brand (Pat Walls / Marc Lou tier), defunct competitor (Microlaunch / Tiny Launch).

## 2-year quarter-by-quarter

```
Y1 already in plan
Q1-Q2 (May-Oct 2026): Stage 1 MVP + 6 agents + 12 connectors
Q3 (Nov-Jan 27):   Self-PH launch. AppSumo LTD. GEO Agent ships (fast win)
Q4 (Feb-Apr 27):   Agency mode. Voice/podcast. Two embedded-SDK partner LOIs

Y2
Q1 Y2 (May-Jul 27): Embedded SDK with first 2 partners. Video distribution
Q2 Y2 (Aug-Oct 27): Custom Agents SDK + API. Investor signaling. Premier tier
Q3 Y2 (Nov-Jan 28): Marketplace opens with 10 launch partners. RetentionLoop GA
Q4 Y2 (Feb-Apr 28): AdsLoop GA. Localization phase 1 (JA/KO/ES)

Y3 (high-conviction extras)
Q1: TikTok/YouTube ad orchestration. Premier Elite scaled
Q2-Q4: Localization full rollout. Death-stars
```

## ARR projections

| Month | Paid | ARPU | Subscription ARR | Premier+Agency | **Total ARR** |
|---|---|---|---|---|---|
| 12 | 1,000 | $42 | $504K | — | **$500K** (PRD) |
| 18 | 800 | $48 | $460K | $90K | **~$550K** (expected dip from Y1 churn shake-out) |
| 24 | 1,500 | $58 | $1.04M | $336K | **$1.4M–$1.8M** |
| 36 | 3,000 | $68 | $2.45M | $750K | **$3–4M** |

Conservative: assumes 1–2 build-platform partners by Y2 exit. If 3+ embed (~10–15% of their daily flow), Y2 ARR clears $2.5M.

**Upsell paths**: Free→Starter (PH attempt requires Starter+), Starter→Pro (2nd launch / 80% credit usage), Pro→Scale (1 launch/mo for 3+ months / team-seat / BYOK toggle), any→Agency (workspace count >2 / client-billing request), any→Premier (LRS<60 OR Day-1 signups<50 → "Want a human to run this?"), any→add-ons (Insight Agent identifies gap).

## Death-stars (if growth strong, $2M ARR by Month 18)

1. **The LaunchWings Network** — literal "publish to LaunchWings" surface. With 25K founders + 100K launches' attribution data, the *aggregated* discovery feed becomes a destination — a smarter Product Hunt that ranks by **revenue traction + retention curves**. Effort XL. Revenue: free for founders, paid placements for tools.
2. **LaunchWings Capital fund** — $5–15M syndicate auto-investing $25–50K checks into top-decile launches based on instrumented MRR + retention. Better signal than any early-stage fund. We're GP; investors LPs.
3. **Founder-OS — beyond launch** — product roadmap, support inbox, lightweight billing/dunning, lightweight first-hire HR. The Notion of solo-founder operations. *Risk: scope sprawl. Mitigation: only ship what feeds back into launch/growth loop.*
4. **Vertical LaunchWingss** — for-Chrome-extensions, for-Notion-templates, for-courses, for-AI-agents. Each a fork with custom directory catalogs, checklists, voice templates. Sold as "Premier Vertical" at +50% premium. Possible to franchise.
