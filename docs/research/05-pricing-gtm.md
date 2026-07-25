# Research Dossier 05 — Pricing, BYOK & GTM

*Source: parallel research agent, May 2026.*

## 1. Solopreneur willingness to pay

Empirical sweet spot: **$29–$199/month**. Below $29 unit economics collapse on CAC; above $200 forces enterprise sales motion solopreneurs reject.

Anchors:
- ~70% of micro-SaaS earn under $1K MRR; ~18% sit at $1K–$5K MRR (Rocking Web 2025).
- 70% of MicroConf founders now require credit-card-up-front on free trials.
- Per-category ceilings:
  - Launch / website tools: $9–$49 (Carrd $9/yr Pro Lite to Webflow $49)
  - Email/newsletter: $39–$89 (Kit $39 at 1K subs, Beehiiv Scale $43, Max $96)
  - Social / scheduling: $15–$30 (Buffer $15, Team $30/user)
  - Testimonials / forms: $16–$29 (Senja Pro $16, Tally Pro $29)
  - AI dev tools: $20–$200 (Cursor Pro $20 / Ultra $200; Replit Core $20 / Pro $100; Lovable Pro $25 / Business $50)

**The $20 anchor is dominant** — Cursor Pro, Replit Core, Lovable Pro all cluster $20–$25. Floor for paid AI-inclusive product. Next ceiling break is **$49**.

Churn ceiling: solopreneur SaaS sees 3–5% monthly churn baseline, ~7.5% annual at best-in-class. Monthly billing churns 2–3× annual.

## 2. Pricing-model recommendation

**Hybrid subscription + credit pool** (Cursor / Lovable / Replit pattern), with annual prepay (-20%) and a time-boxed AppSumo LTD post-PH launch (cap ~1,000 codes).

Pure usage-based rejected (bill-shock kills solopreneurs). Pure subscription too rigid for AI variability.

**Watch-out:** Cursor June 2025 credit-pool backlash — must publish exact credit-to-action mappings transparently or face the same trust hit.

## 3. BYOK strategy

Landscape shifts:
- Cursor removed BYOK for Agent/Edit features late 2025.
- Cline, Continue, Aider, Zed, Claude Code, JetBrains AI all support full BYOK; users report ~50% savings.
- Anthropic cut Windsurf's direct access in June 2025; April 2026 OAuth policy softened to PAYG.
- "Wrap-and-resell" era constrained.

**LaunchWings BYOK design:**
1. **Tier-gated, not free.** Pro and Scale only.
2. **No credit discount, lifted caps.** Same subscription, agent runs become unmetered.
3. **Routing:** default = platform key. User key activates when toggled, when over plan credits, or when EU/regulated context requires own DPA chain.
4. **Security:** AES-256-GCM envelope encryption with KMS CMK-per-tenant; no logging; key validation; rotation UI; one-click revocation; SOC 2 CC6 controls.
5. **ToS posture:** managed = reseller — must add proprietary value (orchestration, memory, integrations) to avoid "wrapper" classification. BYOK = software, cleanest legal posture.

## 4. Tier design (RECOMMENDED)

| | **Free** | **Starter** | **Pro** | **Scale** |
|---|---|---|---|---|
| Monthly | $0 | **$19** | **$49** | **$129** |
| Annual (-20%) | $0 | $15/mo ($180/yr) | $39/mo ($468/yr) | $103/mo ($1,236/yr) |
| Launches/mo | 1 | 3 | 15 | Unlimited |
| AI agent runs | 50/mo | 1,000 credits | 5,000 credits | 20,000 credits + 1mo rollover |
| Integrations | 2 (Twitter, PH) | 5 (+ LinkedIn, Reddit, Mailchimp) | 15 (all) | All + Zapier/Make + custom API |
| Analytics retention | 7 days | 30 days | 12 months | 24 months + CSV |
| Support SLA | Community | Email 48h | Email/chat 24h | Priority chat 8h, Slack on annual |
| BYOK | No | No | **Yes** (lifts AI cap) | **Yes** (custom routing) |
| Watermark | "Made with LaunchWings" | Removable | Removable | Removable + custom domain |
| Seats | 1 | 1 | 2 | 5 |

The $19/$49/$129 ladder undercuts Beehiiv Max ($96) and Lovable Business ($50) at Pro break, while Scale at $129 sits below Replit Pro and well under Cursor Ultra.

## 5. Acquisition strategy

**Programmatic SEO** — three clusters:
- `/launch-checklist/[product-type]` (SaaS, Chrome ext, mobile, AI tool, Notion template, course, ebook, newsletter) — 30–50 templates.
- `/alternatives/[competitor]` (PH, BetaList, Mercury Raise, Failory, Listing Bott).
- `/launch-day/[platform]` (Reddit / HN / Twitter / PH / LinkedIn).

Target: 500 indexed pages by month 6, 50K organic/mo by month 12.

**Creator partners:** Greg Isenberg, Pat Walls (Starter Story), Pieter Levels, Marc Lou, Arvid Kahl. Expect $2K–$10K per integrated video + affiliate stack.

**Affiliate:** **30% recurring for 12 months, 90-day cookie**. Rewardful or Tolt.

**10 free lead-magnet tools:**
1. Launch Readiness Score (URL → 0–100 audit)
2. PH Tagline Generator (5/day, email gate)
3. Hunter Finder
4. Launch Day Countdown Timer (embed widget links back)
5. Reddit Subreddit Recommender
6. Cold DM Template Library (50+ templates, email gate)
7. Pricing Page Teardown (URL → AI critique)
8. Competitor Tracker (3 competitors, weekly digest)
9. SEO Slug & Meta Generator
10. Launch Tweet Thread Composer (5 free/mo)

**Self-PH launch:** 12:01 AM PST, pre-build 500-person notify list 30 days out. Hunter: tier-1 maker. Goal: #1 PoD, 1,500+ upvotes, 2,500 signups, ~150 paid (10% day-1 promo).

**AppSumo LTD:** post-PH, ~month 6, capped at 1,000 codes at $79 (~$24K net after 70% take). Treat as paid acquisition channel, not revenue.

## 6. Activation & retention economics

| Metric | Target | Benchmark |
|---|---|---|
| Free → Paid conversion | 4–6% | PLG median 2–5% |
| Gross margin (managed AI) | 70% | After ~25% AI cost + 5% Stripe/infra |
| Gross margin (BYOK) | 92% | No AI COGS |
| Blended GM target | 75–78% | |
| NRR | 105–110% | |
| Monthly logo churn | 5–7% | SMB benchmark 3–5% |
| Monthly revenue churn | 3–4% | After expansion |

**Year-1 scenario (10K free signups):** 500 paid, mix 60/30/10 across Starter/Pro/Scale → blended ARPU ~$37/mo. Ending paid base ~350 after 6% monthly churn. **Year-1 ARR ≈ $155K–$180K, MRR exit $13–15K.** Plus AppSumo $24K. **Year-1 bookings ≈ $200K**, sufficient for one-founder + one-engineer + one-DevRel runway if seed-funded.

## 7. Compliance basics

- **GDPR:** Public DPA (Vanta/Drata auto-flow); Article 28 sub-processor list (AWS, Stripe, Anthropic, OpenAI, Postmark, Segment, Cloudflare); EU data residency at Scale tier.
- **CCPA:** "Do Not Sell" link; 45-day deletion endpoint.
- **SOC 2 Type I:** Begin at ~50 paying customers or first enterprise-adjacent ask. $15K–$25K total with Vanta/Drata; 6–12 weeks to readiness.
- **Encryption:** TLS 1.3, AES-256-GCM at rest, KMS-managed, BYOK envelope encryption with per-tenant context.

## 8. Defensibility

- **ProductHunt** is single-day directory; building agentic workflow conflicts with their neutral-marketplace positioning.
- **Mercury Raise** targets funded startups — opposite ICP. Adjacent partnership channel.
- **HubSpot** built for 10–500 employee SMBs; structurally blocked from going down-market.

**Moats:**
1. Workflow lock-in (analytics + integrations + 6-month history).
2. Data network effect — aggregated anonymized launch outcomes train recommendations.
3. Distribution flywheel — "Made with LaunchWings" watermark + embed widgets compound referrals.
4. BYOK as hedge against Anthropic/OpenAI reseller-term tightening.
5. Solopreneur ICP discipline — wedge incumbents can't enter without cannibalization.

## Sources

Freemius, Rocking Web, IndieHackers, Cursor docs, Cline, JetBrains, Buffer, Beehiiv, Kit, Framer, Senja, Tally, AppSumo, Bootstrapped Founder, UserJot, Vena, Churnkey, BeyondLabs, Whale, Targhee Security, Comp AI, Secure Privacy.
