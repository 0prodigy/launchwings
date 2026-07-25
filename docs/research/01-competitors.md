# Research Dossier 01 — Competitive Landscape

*Source: parallel research agent, May 2026.*

> **Important framing:** LaunchWings does NOT compete with these directories. It *orchestrates* a solopreneur's launch onto them and runs a launch-readiness checklist. The "competitors" below are channels we integrate with, plus tool-stack pieces we consolidate.

## 1. Launch directories (channels we integrate with)

### Product Hunt + Ship
- **Pricing:** Free to launch; Ship historically $79 / $249, now legacy.
- **Traffic:** ~2.7M–3.3M MUV (SimilarWeb).
- **Conversion:** ~1–3% from PH visit (vs BetaList 15–20%).
- **Weaknesses:** Vote-rings + influencer hunters dominate first-time makers; opaque ranking; "many of them were censored" (Trustpilot 2.x avg).
- **API:** OAuth + GraphQL `api.producthunt.com/v2/docs` — read-only effectively (post creation must use Maker UI).

### BetaList
- **Pricing:** Free (multi-week queue) or **$39 / $99 / $129** expedited; Boost subscriptions added MRR (+30% rev after rename).
- **Traffic:** ~100k–200k MUV (~30× less than PH).
- **Conversion:** **15–20% signup rate**, $0.50–$1.40 CPL paid tier.
- **Weakness:** "Almost all visitors are people who want their product promoted" — agency/consultant pitches dominate.

### Launching Next
- **Pricing:** Free w/ multi-week queue; fast-track ~$49.
- **Weakness:** "Visibility uneven, many startups sink quietly into the archive."

### Peerlist Launchpad
- **Pricing:** Free weekly Launchpad.
- **Weakness:** Audience is mostly other builders — limited buyer reach.

### Hacker News (Show HN)
- **Pricing:** Free.
- **Traffic:** Front page can deliver 3.5K–30K visitors; Groove case: 105K visits → 97 signups → 14 paid (12.5% trial-to-paid, 0.09% visit-to-paid).
- **Weakness:** Brutal comment culture; technical audience; opaque ranking.

### Indie Hackers
- **Conversion:** 23.1% per engaged post but requires 4–6 months of sustained engagement.
- **Insight:** Direct product announcements lowest engagement; revenue/journey posts win.

### Microlaunch
- **Pricing:** Premium from $49/mo.
- **Notable:** **AI landing-page review with quick-wins ranked by ROI** — one of few competitors with embedded AI.

### Tiny Launch / Uneed / Fazier / 10words / SaaSHub / StartupBase / Pitchwall / F6S
- Mix of $19–$657 paid placements, queues, and newsletter blasts.
- **Fazier IH postmortem:** "Product of the Day on Fazier — 45 visits, 0 sales."
- **10words** has 400+ day waitlist on free tier.
- **F6S:** opaque service-based pricing; G2 reviews cite stale data and spammy outreach.

## 2. Adjacent tools we consolidate (replace 5–6 line items)

| Category | Tool | Pricing entry | What we replace |
|---|---|---|---|
| Newsletter | Beehiiv / Substack / Kit | $29–$49/mo | Drafts in our voice, sends via their API |
| Testimonials | Senja / Testimonial.to | $20–$59/mo | Auto-collect on Stripe paid, embed widget |
| Forms / waitlist | Tally / Typeform | $0–$79/mo | Native waitlist with referral built in |
| Waitlist+virality | GetWaitlist / Prefinery / SparkLoop | $15–$2,000/yr | Native referral mechanic |
| Social scheduling | Buffer / Hypefury / Typefully | $5–$199/mo | Native AI drafts + scheduling |
| Affiliate | Rewardful / FirstPromoter | $49/mo | Native (Stripe-driven) |
| SEO content | SEOBotAI / Writesonic / Jasper | $19–$625/mo | Programmatic SEO Agent |
| Product analytics | PostHog / Plausible / Mixpanel | $9–$450/mo | Embedded launch analytics |

**Today, a solopreneur stitches 8–12 tools at $300–$500/mo.** Our wedge: $39/mo Pro replaces 5–6 of them.

## 3. Public traffic / revenue snapshots

| Platform | MUV | Notes |
|---|---|---|
| Product Hunt | 2.7M–3.3M | ~52% bounce |
| BetaList | 100k–200k | |
| Indie Hackers | ~500k–800k | |
| Uneed | 42k–71k | |
| Pitchwall | (newsletter 45k) | |
| Fazier | ~6k MUV / 2.5k newsletter | |
| SaaSHub | "hundreds of thousands"; Weekly newsletter 16,300+ | |
| Microlaunch | 5–20k est. | |
| HN front page | 3.5k–30k per appearance | |

Indie revenue (founder posts): Senja ~$50–60k MRR; Hypefury ~$60–80k MRR; Beehiiv 100k+ paying creators (raised $33M+); PostHog $30M+ ARR.

## 4. Gaps no competitor fills (LaunchWings wedges)

1. **No launch-readiness checklist + gating.** Founders submit unprepared and get crushed. LaunchWings's pre-flight checklist (basic → advanced) blocks bad launches and fixes them first.
2. **No unified multi-directory orchestrator.** "LaunchDirectories" and similar are manual VAs at $200–$500 per campaign. No AI.
3. **No AI launch copywriter that adapts per channel.** PH wants tagline; HN wants Show post; BetaList wants beta hook; LinkedIn wants narrative. Founders rewrite 12 times today.
4. **No closed-loop launch → waitlist → social proof → referral.** Senja/GetWaitlist/Rewardful/Buffer live in silos.
5. **No agentic outreach to micro-influencers/hunters.** Manual DM sourcing today.
6. **No traffic-quality scoring across launch venues** by ICP. No predictive ROI engine.
7. **No "launch day war-room" agent.** Comments, replies, social pushes, email lists — manual today.
8. **No SEO-content engine tied to launch.** General-purpose tools don't auto-generate launch artifacts (FAQ, comparison pages, alternatives, Show HN post, founder thread, demo script).
9. **No analytics layer specific to launch campaigns.** PostHog/Mixpanel are pipelines; they don't say "BetaList traffic converts 3× better than Uneed for your ICP."
10. **No retention loop after launch day.** Directories dump after 24h. Nobody helps convert email → trial → paid → referral over the next 30 days.

## 5. Risks

- PH brand moat is real (3M+ MUV); LaunchWings must complement, not threaten.
- Most directory APIs are absent — 80% of submissions need manual form fill. RPA queue (Browserbase/Stagehand) required.
- Anti-spam policies on directories (BetaList, Fazier, PH) explicitly police automated submissions. Position as "AI assistant, human-in-loop," never "automated spammer." Every external send goes through approval default-on Free/Starter.

## Sources

Product Hunt API, BetaList criteria, awesome-directories, Microlaunch, Tinylaunch, Uneed, Fazier IH postmortem, Peerlist, Pitchwall, SaaSHub, StartupBase, F6S G2 reviews, Indie Hackers, Groove HN postmortem, SimilarWeb, Trustpilot, G2, Beehiiv vs Substack 2026, Senja, Testimonial.to, Tally, Typeform, Prefinery, GetWaitlist, SparkLoop, KickoffLabs, Buffer, Typefully, Hypefury, Writesonic, SEOBotAI, Rewardful, FirstPromoter, PostHog, Mixpanel, LemonSqueezy, LifeStarr, DEV.
