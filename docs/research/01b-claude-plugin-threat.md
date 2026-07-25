# 01b — Claude Plugin Threat Dossier

*Last touched 2026-05-14. Audience: LaunchWings founder + `ceo` / `cto` / `growth-lead` agents. Companion to [`docs/product/MOAT.md`](../product/MOAT.md). Threat-only — moat reasoning lives in MOAT.md.*

---

## 1. TL;DR

As of 2026-05-14, the entire generative half of an "AI launch platform" wedge is now a free `claude plugin install` away — `claude-seo` (25 sub-skills, 18 sub-agents), Anthropic's first-party Marketing plugin (Jan 2026), SearchFit SEO, and dozens of MIT-licensed `marketingskills` repos all draft taglines, hero copy, FAQs, X threads, LinkedIn posts, Reddit launches, comparison pages, GEO/AEO content, schema markup, and technical SEO audits. Any horizontal "AI agents write your launch copy" positioning has a ~6-month half-life before users discover the plugin path and stop paying for the wrapper. The only surfaces plugins structurally cannot reach are (a) tenant-credential OAuth posting under live rate limits, (b) deliverability operations (mail warming, IP rotation, DKIM/DMARC/SPF), (c) Stripe-attributed revenue back to channel + copy + timing, and (d) k≥50 cross-cohort outcome benchmarks. See [`MOAT.md`](../product/MOAT.md) for the defensibility thesis those map to.

---

## 2. Plugin landscape (as of 2026-05-14)

| Plugin / repo | License | What it generates / does | Distribution surface | Free? | Updated |
|---|---|---|---|---|---|
| [claude-seo (AgriciDaniel)](https://github.com/AgriciDaniel/claude-seo) | MIT | 25 sub-skills + 18 sub-agents. Technical SEO audit, GEO/AEO optimisation, X-vs-Y comparison pages, alternatives-to pages, semantic clustering, schema/JSON-LD, backlink planning, prioritised-fix scoring. | GitHub + Claude Code `plugin install` | Yes | Active (2026) |
| [claude-seo (ivankuznetsov)](https://github.com/ivankuznetsov/claude-seo) | MIT | Fork/alternate: SEO audit, on-page + technical recommendations, content briefs, metadata generation. | GitHub | Yes | Active (2026) |
| [claude-seo (avalonreset)](https://www.claudepluginhub.com/plugins/avalonreset-claude-seo) | MIT | Third-party SEO skill bundle indexed on Claude Plugin Hub. | Claude Plugin Hub | Yes | Active (2026) |
| [claude-seo.md (standalone)](https://claude-seo.md/) | Open prompt | Single-file Markdown SEO playbook drop-in for any Claude Code session. | Direct download | Yes | Active (2026) |
| [SearchFit SEO](https://claude.com/plugins/searchfit-seo) | First-party listing | SEO audit, keyword research, on-page recommendations, SERP-fit scoring inside Claude. | Anthropic plugin marketplace | Yes (free listing) | Live 2026 |
| [Anthropic Marketing plugin](https://claude.com/plugins/marketing) | First-party (Anthropic) | Campaign planning, content calendars, SEO audits, email nurture sequences, brand-voice copy. Shipped Jan 2026 as part of Cowork launch. | Anthropic plugin marketplace | Yes (bundled w/ Claude) | Jan 2026 |
| [marketingskills (coreyhaines31)](https://github.com/coreyhaines31/marketingskills) | MIT | Skill collection: positioning, landing-page copy, launch-thread drafting, founder-story narratives, comparison pages. | GitHub | Yes | Active (2026) |
| [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills) | MIT | Multi-domain skill library incl. marketing, SEO, social drafts, outreach templates. | GitHub | Yes | Active (2026) |
| [Claude Marketplaces directory](https://claudemarketplaces.com/) | Index | Aggregator: 4,200+ skills, 770+ MCP servers, 2,500+ marketplaces — discovery surface that makes any one wrapper trivially substitutable. | Web directory | Yes | Live 2026-05 |

---

## 3. Side-by-side — Plugins vs. LaunchWings

| Feature | Plugins | LaunchWings |
|---|---|---|
| Tagline drafting | Yes (claude-seo, Marketing plugin, marketingskills) | Yes (bundled free) |
| Hero / landing copy | Yes (marketingskills, Marketing plugin) | Yes (bundled free) |
| FAQ generation | Yes (Marketing plugin, marketingskills) | Yes (bundled free) |
| X / Twitter launch thread | Yes (marketingskills, alirezarezvani/claude-skills) | Yes (bundled free) |
| LinkedIn launch post | Yes (Marketing plugin, marketingskills) | Yes (bundled free) |
| Reddit launch draft | Yes (marketingskills) | Yes (bundled free) |
| Programmatic SEO pages | Yes (claude-seo — X-vs-Y, alternatives-to) | Yes (bundled free) |
| OG image generation | Partial (prompt-only; needs external renderer) | Yes (bundled free) |
| Comparison / alternatives pages | Yes (claude-seo) | Yes (bundled free) |
| GEO / AEO (LLM-answer optimisation) | Yes (claude-seo) | Yes (bundled free) |
| Technical SEO audit | Yes (claude-seo, SearchFit SEO) | Yes (bundled free) |
| Schema / JSON-LD markup | Yes (claude-seo) | Yes (bundled free) |
| **OAuth posting under tenant credentials (X, LinkedIn, Reddit, Beehiiv, Resend)** | **No** — plugin runs in user's Claude session, no server-side token vault | **Yes** |
| **Mail-warming across 30 days** | No | Yes |
| **Sending-IP rotation + shadow-ban detection** | No | Yes |
| **DKIM / DMARC / SPF maintenance** | No | Yes |
| **Monitor model on every outbound (toxicity / brand / policy)** | No | Yes |
| **Per-channel rate caps enforced in Redis** | No | Yes |
| **Stripe / Polar / LemonSqueezy attribution back to channel + copy + timing** | No | Yes |
| **Cohort benchmarks (k≥50) across launches** | No — plugin user is n=1 | Yes |
| **Directory RPA submission (BetaList, Uneed, ProductHunt staging, etc.)** | No | Yes |
| **Take-rate billing on attributed MRR (skin in the game)** | No — flat token cost regardless of outcome | Yes |

---

## 4. Three threats to pre-empt

**(a) Anthropic ships a first-party "Launch" plugin.** Plausible extension of the [Marketing plugin](https://claude.com/plugins/marketing); would absorb tagline + hero + thread + FAQ generation overnight. *Counter (from [MOAT.md §1 / §2](../product/MOAT.md)):* outcome-aligned pricing ($0 base + take rate on attributed MRR) and operational connector surface are not features Anthropic ships — they require holding tenant OAuth, sending-domain warmth, and Stripe attribution.

**(b) Lovable / Bolt embed an in-canvas launch plugin powered by the same free skills.** Distribution advantage — they already own the build surface. *Counter (from [MOAT.md §3](../product/MOAT.md)):* cross-cohort outcome data (k≥50 attributed launches in the AI-build-platform vertical) is a network effect that compounds with usage; an in-canvas wrapper around free skills still ships with sample size of one.

**(c) A $2k-funded indie packages `claude-launch` — a meta-plugin combining claude-seo + Marketing plugin + a ProductHunt / BetaList MCP.** This is the most likely near-term threat: free, MIT, weekend-built. *Counter (from [MOAT.md §2](../product/MOAT.md)):* connector + reputation operations (mail warming, IP rotation, DKIM/DMARC, monitor-model, audit chain) require a maintenance budget no unfunded indie can sustain past launch week.

---

## 5. Sources

- [claude-seo (AgriciDaniel) — GitHub](https://github.com/AgriciDaniel/claude-seo)
- [claude-seo (ivankuznetsov) — GitHub](https://github.com/ivankuznetsov/claude-seo)
- [claude-seo (avalonreset) — Claude Plugin Hub](https://www.claudepluginhub.com/plugins/avalonreset-claude-seo)
- [claude-seo.md — standalone](https://claude-seo.md/)
- [SearchFit SEO — Anthropic plugin marketplace](https://claude.com/plugins/searchfit-seo)
- [Anthropic Marketing plugin](https://claude.com/plugins/marketing)
- [marketingskills (coreyhaines31) — GitHub](https://github.com/coreyhaines31/marketingskills)
- [alirezarezvani/claude-skills — GitHub](https://github.com/alirezarezvani/claude-skills)
- [Claude Marketplaces directory — 4,200+ skills, 770+ MCP servers, 2,500+ marketplaces](https://claudemarketplaces.com/)
- [LaunchWings MOAT.md — defensibility thesis](../product/MOAT.md)
