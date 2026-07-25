# Research Dossier 03 — Integrations & Distribution Catalog

*Source: parallel research agent, May 2026.*

## 1. Launch directories (Tier 1, must-have)

| Directory | DR | MUV | Submission | Automation feasibility |
|---|---|---|---|---|
| Product Hunt | 91 | 4–5M | OAuth + GraphQL `api.producthunt.com/v2/docs`; cannot auto-launch via API (Maker UI) | Semi-auto: pre-warm via API, schedule via Maker dashboard |
| Crunchbase | 91 | 60M+ | Manual + Enterprise API ($49–$999/mo) | Auto-populate via Enterprise API |
| Trustpilot | 91 | 50M+ | Business API after verification | Full automation via Reviews API |
| SourceForge | 91 | 25M | Manual upload, OSS only | Semi-auto via release feeds |
| G2 | 90 | 10M+ | Manual vendor onboarding | Listing manual; review widgets via API |
| StackShare | 89 | 2M | Manual; great for dev tools | Manual |
| Capterra/GetApp/Software Advice | 78–86 | 6M+ each | One Gartner Digital Markets form fans out | Manual |
| AlternativeTo | 84 | 8M | Free user submission, community-curated | Manual but high-leverage |
| AppSumo | 82 | 3M | Marketplace application; revenue-share | Manual |
| Slant | 68 | 600K | Community Q&A | Manual |

**Tier 2 (indie/SaaS):** BetaList (DR 78, 600K, $129 expedited), Indie Hackers (Stripe-owned, 1.6M, free via Stripe Connect), SaaSHub (DR 73, 856K, $99/mo featured), Peerlist Project Spotlight (free monthly cohort), Launching Next, FoundrList, Uneed, MicroLaunch, Tiny Startups, OpenAlternative, Startup Stash, Side Projectors, F6S (1.08M), HN Show HN (free, account >30d, can drive 20–30K in a day), Lobsters (invitation-only), DevHunt, Tinylaunch, Toolify.

**AI-specific (60+):** There's An AI For That (2M MUV), Futurepedia (5M), Insidr.AI, Top.AI, EasyWith.AI, AI Toolhouse, Promptbase, ToolHunt — full catalog at listmyai.net.

**Reddit launch subs (95/5 rule, 200+ karma min):** r/SaaS (100K), r/SideProject, r/Startups (1.6M, megathreads only), r/Entrepreneur, r/IndieHackers, r/microsaas, r/webdev (Showoff Saturday), r/InternetIsBeautiful, r/coolgithubprojects, r/selfhosted, r/nocode, r/EntrepreneurRideAlong.

**Authoritative source lists:** [SubmitSaaS 700+ DB](https://submitsaas.com/directories), [awesome-saas-directories](https://github.com/mahseema/awesome-saas-directories), [foundrlist 80+](https://www.foundrlist.com/blogs/complete-startup-directory-list-2026).

**Automation reality:** 80% of these require human-touch forms. RPA queue with Browserbase/Stagehand + stored credentials per user is the MVP approach. Anti-spam policies require human-in-loop default.

## 2. Social platforms

| Platform | Pricing/Auth | Limits | Automation risk |
|---|---|---|---|
| **X / Twitter API v2** | PAYG default Feb 2026: $0.005/post read, $0.01/profile, $0.01/post write, 2M reads/mo cap. Legacy Basic $200/mo (50K), Pro $5K/mo (300K), Enterprise from $42K/mo. OAuth 2.0 PKCE. | Threads, scheduling, replies all supported | Medium — anti-spam heuristics ban duplicate content |
| **LinkedIn** | OAuth 2.0; `w_member_social` (3K char), `w_organization_social` for company. Tokens 60d / refresh 365d. MDP approval needed for full functionality. | ~100 calls/day/member | Posting >1–2/day to company page reduces algorithmic reach more than triggers bans |
| **Reddit** | OAuth 2.0; 60 req/min auth, 100/min free (10-min rolling); $0.24/1K commercial; pre-approval required | PRAW handles backoff | Extreme — same-link cross-sub = instant shadowban; 30+ day account age, 100+ karma sub minimums |
| **Bluesky (AT)** | Free, app password; 5,000 write points/hour | 41M users (Dec 2025) | Low — decentralized by design |
| **Mastodon** | Per-instance OAuth; ~300 req/5 min | ActivityPub federated | Low |
| **Threads** | Meta Threads Graph API; OAuth + app review | 250 posts/24h; 400M MAU | Medium |
| **Discord** | Bot tokens, webhooks; 50 req/sec global, 5/5s/channel | DM scraping is anti-pattern | High — most servers ban DM scraping |
| **Slack** | `chat.postMessage` 1 msg/sec/channel; tier-2 ~20 req/min | Cannot mass-DM external workspaces | Low |
| **TikTok** | Content Posting API: 15 videos/day/creator, 6 req/min/token | Video-only, 10–60min cap | Medium |
| **Instagram Graph API** | Basic Display deprecated Dec 2024. Now Business/Creator only via FB Page link | ~25 posts/day per account | Medium |
| **YouTube Data API v3** | OAuth 2.0; 10,000 quota units/day; upload = 1,600 units (~6/day baseline) | Free | Low |

## 3. Email & newsletter

| Provider | Free | Paid entry | Use |
|---|---|---|---|
| Resend | 3K/mo, 100/day | $20/mo (50K) | Best-DX transactional + React-Email |
| Postmark | 100/mo trial | $15/mo (10K) | 98.7% inbox placement |
| Mailgun | None | $35/mo Foundation; Flex $1/1K PAYG | High-volume, EU regions |
| SendGrid | killed 2024 | $19.95 Essentials (50K) | Legacy enterprise |
| Loops | 1,000 contacts | $49/mo | SaaS lifecycle drip |
| Beehiiv | 2,500 subs | $39/mo Scale | Newsletter + viral referral, 0% fee on paid |
| Substack | Free | 10% on paid subs | Easy distribution; lock-in |
| Kit (ConvertKit) | 10K free | $29/mo | Best automation builder |
| Mailchimp | 500 contacts | $13/mo | Most universal integrations |

**Cold email:** Instantly Growth $47/mo (unlimited inboxes, 4.2M warmup network), Smartlead $39 / $94 (150K emails/mo), Apollo $59–$119/seat (275M-contact DB). All require CAN-SPAM + GDPR explicit consent for EU.

## 4. Analytics

| Tool | Free | Paid | Use |
|---|---|---|---|
| **PostHog** | 1M events/mo | $0.00031/event | Product analytics + replay + flags + experiments |
| Plausible | 30-day trial | $9/mo (100K pv) | Privacy-first |
| Fathom | Trial | $15/mo (100K) | Privacy-first |
| Mixpanel | 1M events | $0.28/1K after | Funnels/cohorts |
| Amplitude | 10M events/mo | Custom | Enterprise |
| GA4 | Free (10M) | $150K/yr GA360 | Channel attribution |
| **Microsoft Clarity** | 100% free, no caps | — | Heatmaps + replay |
| Hotjar | 35 sessions/day | $39/mo | Heatmaps + surveys |
| LogRocket | 1K sessions/mo | $69/mo | Dev replay + logs |
| FullStory | 30K sessions trial | Custom | Best-in-class replay |

**Conversion plumbing:** Stripe webhooks (free, signed), Segment ($120/mo for 10K MTUs), RudderStack (250K events free, $220/mo for 1M = ~10× cheaper than Segment; OSS self-host avoids per-event costs).

## 5. Waitlist & landing

**Builders:** Framer ($5–$25/mo), Webflow ($14–$39/mo), Carrd ($9–$49/yr), Typedream, Pory.

**Forms:** Tally (unlimited free + REST API + webhooks), Typeform (10/mo free, API + webhooks), Fillout (1K free).

**Waitlist+virality:** GetWaitlist ($15/mo, free killed June 2025); Prefinery (most robust API; tier-based rewards); KickoffLabs (best gamified contests + fraud detection); Viral Loops (Dropbox/Harry's templates).

## 6. Payments / MoR

| Provider | Fee | MoR? | Use |
|---|---|---|---|
| **Stripe** | 2.9% + $0.30 | No | US/strong onboarding |
| Lemon Squeezy | 5% + $0.50 | Yes | Simple SaaS, global tax |
| Paddle | 5% + $0.50 | Yes | 200+ jurisdictions |
| Polar.sh | 4% + $0.40 (covers Stripe) | Yes | GitHub-native, simple |

Polar lacks proration/dunning/contracts as of 2026; LemonSqueezy lacks PO/net-terms. Both fine sub-$500K ARR.

## 7. Reviews / social proof

**Senja** ($19–$76/mo, REST API + webhooks, imports from G2/Trustpilot, video + Wall of Love widgets) — primary. Trigger Senja review on Stripe `invoice.paid`; rotate top quotes onto landing.
**Testimonial.to** ($25–$60/space, Zapier+API).
**Vouch** (video-first enterprise).
**Trustpilot** (free Business tier, Reviews API on paid).
**G2** (review widgets via Buyer Intent API on paid).

## 8. SEO

**Keyword/SERP APIs:**
- **DataForSEO** — $0.0006/SERP call, $50 min deposit, no subscription, broadest coverage (best for batch).
- **Serper** — $0.30/1K queries, 2,500 free/mo, fastest live SERP.
- **Ahrefs** — $129/mo Lite, limited API units.
- **Semrush API** — Business $499.95/mo + ~$50/M units.
- **Apify** — actor marketplace, pay-per-result for PH/AlternativeTo scrapers.

**Indexing:** Google Indexing API (200/day default — meant for JobPosting/BroadcastEvent, in practice works for any URL), Search Console API for keyword tracking, **Bing Webmaster URL Submission API = 10,000 URLs/day** after verification, **IndexNow protocol** (Bing + Yandex) = single endpoint instant ping.

**Schema.org/JSON-LD:** Pages with valid structured data are 2.3× more likely in Google AI Overviews. Auto-emit Product, SoftwareApplication, FAQPage, Organization, BreadcrumbList.

## 9. Affiliate / referral

| Tool | Entry | API | Stack fit |
|---|---|---|---|
| **Rewardful** | $49/mo | REST + Stripe-native webhooks | Stripe SaaS — DEFAULT |
| FirstPromoter | $49/mo | REST; Stripe/Paddle/Chargebee | Multi-PSP |
| Tolt | $69/mo (≤$10K MRR) | REST | Modern indie |
| PartnerStack | $500+/mo | Enterprise | B2B partner ecosystem |
| Affonso/Partnero | $39+/mo | REST | Cheap alternatives |

## 10. Press / PR

**Featured.com (revived HARO)** — free email digests 3×/day; LaunchWings email-parses.
**Qwoted** — free + paid, no API.
**Help A B2B Writer** — free niche queries.
**SourceBottle** — AU/UK/US, free.
**Muck Rack** — enterprise journalist DB ($5K–$50K/yr) with full API for lists/campaigns/coverage.
**PressFarm** — done-for-you packages from $90.

## Top 30 must-have integrations for MVP (impact × ease)

1. **Stripe** — payments + webhooks; foundation
2. **Resend** — transactional + broadcast
3. **PostHog** — analytics + replay + flags + experiments
4. **Microsoft Clarity** — free heatmaps/replay, no caps
5. **Tally** — free unlimited form/waitlist intake
6. **Getwaitlist or Prefinery** — viral referral
7. **Senja** — testimonials + Wall of Love
8. **Rewardful** — Stripe-native affiliates
9. **Bluesky API** — free, generous, growing
10. **X API (legacy Basic if available, else PAYG)** — highest reach
11. **LinkedIn Posts API** — B2B SaaS audience
12. **Reddit OAuth** — gated; orchestrate scheduled drafts
13. **Product Hunt GraphQL** — pre-launch hunters/upvoters
14. **Indie Hackers** (manual + RPA) — community post
15. **Hacker News Show HN** — manual submit, automated comment-watch
16. **Beehiiv** — newsletter + boosts
17. **Loops** — lifecycle drip
18. **Google Search Console API** — keyword + impression tracking
19. **Bing URL Submission API + IndexNow** — instant indexing
20. **DataForSEO** — pay-per-call keyword/SERP
21. **Schema.org JSON-LD generator** — built-in template injection
22. **AlternativeTo** (RPA) — high-DR backlink
23. **SaaSHub** (RPA) — DR-73 directory
24. **G2 listing** (RPA) — DR-90 review credibility
25. **Capterra/GetApp** (single Gartner form RPA) — DR-78
26. **BetaList** (paid expedited) — pre-launch buzz
27. **Featured.com (HARO)** — email-parse PR queries
28. **Discord webhooks** — community announcements (opt-in)
29. **YouTube Data API** — auto-upload demo + Shorts
30. **TikTok Content Posting API** — short-form viral lever (15/day cap)

Each maps to a direct user outcome: payment → revenue, Resend → activation drip, PostHog → drop-off, Senja → social proof, Rewardful → distribution, Bluesky/X/LinkedIn → reach, PH/IH/HN → spike-day traffic, RPA queue → 30+ DR backlinks in 90d, GSC+IndexNow → organic compounding.

## Sources

PH API, BetaList criteria, foundrlist, SubmitSaaS, awesome-saas-directories GitHub, listmyai, Postproxy X API 2026, Sorsa Twitter PAYG, Microsoft Learn LinkedIn, Phyllo LinkedIn, PainOnSocial Reddit, Reddit Data API wiki, Lovable Bluesky vs Threads, Raymond Camden Bluesky, TikTok Content Posting API, Phyllo Instagram, BuildMVPFast email, DevToolPicks email + analytics, almcorp Beehiiv vs Kit, Amplemarket cold email, StackScored, Amplitude session replay, Volument RudderStack vs Segment, Tally + Framer, Waitlister 2026, supastarter, fintechspecs Stripe vs Paddle, Senja API, NextGrowth SEO, DataForSEO review, Bing Webmaster, IndexNow, Schema Pilot, FirstPromoter pricing, prezly HARO alternatives, Muck Rack API, SubredditSignals, ScrollLaunch PH alternatives, Market Clarity 70 platforms, GitHub awesome-producthunt-alternatives.
