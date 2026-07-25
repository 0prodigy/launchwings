# Research Dossier 02 — AI Agent Stack

*Source: parallel research agent, May 2026.*

## 1. Architecture pattern (production)

Common pattern across Lindy, Relevance AI, Gumloop, Zapier Agents, Devin, OpenAI Operator, Claude Agent SDK:

```
trigger → plan → tools → memory → output
                  ↑___________|
              (with monitor + human-in-the-loop gate)
```

Key takeaways:
- **Lindy**: two-tier memory (working + persistent vector); one-agent-per-JTBD.
- **Claude Agent SDK**: subagents run in fresh context, return only final message — perfect for parallelizing without polluting parent context.
- **Devin 2.0**: moved from "fully autonomous" to "agent-native IDE" with multi-agent parallelism + confidence-based clarification — humans-in-the-loop is table-stakes.
- **OpenAI Operator/CUA**: dedicated *monitor model* watches outbound actions for prompt-injection.
- **Zapier Agents**: 38% of production users keep human-in-the-loop approval gates.
- **Multi-agent literature consensus**: don't start multi-agent. Start with single agent + small tool set, grow into Orchestrator-Worker / Router / Critic-Refiner only after single-agent fails.

## 2. Architectural recommendation for LaunchWings

- Build on **Claude Agent SDK with subagents**. Each specialist = one subagent invocation with pinned model, scoped tool list, memory directory.
- Use **Orchestrator-Worker**: Launch-Day Orchestrator plans, delegates to specialist subagents in parallel.
- **Critic-Refiner loop** on every customer-facing artifact (copy, DMs, emails) — cheap critic agent reviews before sending.
- **Monitor model** (Haiku) scans every outbound action for brand/PII/spam violations.
- **Default human-in-the-loop** for any external send; users can upgrade specific agents to autonomous.

## 3. The 16 specialist agents

For each: name | JTBD | inputs | outputs | tools | success metric | model tier.

1. **Positioning Agent** — Synthesize ICP, taglines, value props. *Inputs:* product description, founder Loom transcript, competitor URLs. *Outputs:* messaging.md (3 ICPs, 5 taglines). *Tools:* web search, scrape, transcript ingest, Perplexity. *Metric:* tagline CTR uplift. *Model:* Sonnet.

2. **Landing Page Agent** — Generate + iterate hero, body, social proof, CTA. *Tools:* image gen (Flux/Ideogram), Vercel deploy, PostHog read, screenshot diff. *Metric:* visitor → signup. *Model:* Sonnet for copy, Haiku for variant remix.

3. **SEO Programmatic Pages Agent** — 50–500 long-tail pages from keyword corpus. *Tools:* DataForSEO/SerpAPI, Ahrefs MCP, Firecrawl, internal linker. *Metric:* indexed pages × clicks at 30/60/90d. *Model:* Haiku w/ Sonnet QA.

4. **Cold Outreach Agent** — Multi-channel sequenced (email → LinkedIn → X DM). *Tools:* Apollo, Clay, Smartlead, LinkedIn, X API, Hunter, MX validation. *Metric:* reply rate, meetings booked. *Model:* Sonnet first message, Haiku follow-up.

5. **Reddit/Forum Engagement Agent** — Find threads, draft non-spammy contextual replies. *Tools:* Reddit API, IndieHackers scrape, HN API, Discord webhooks, sentiment. *Metric:* upvotes, CTR, no removals. *Model:* Sonnet.

6. **X/Twitter Build-in-Public Agent** — Daily posts from GitHub commits + metrics. *Tools:* X API, GitHub, Linear, Stripe, PostHog. *Metric:* impressions, follower growth. *Model:* Sonnet.

7. **LinkedIn Founder Voice Agent** — Long-form thought leadership. *Tools:* LinkedIn API, image gen, voice template, Grammarly-style grader. *Metric:* impressions, comments. *Model:* Sonnet + style-fine-tuned prompt.

8. **Launch-Day Orchestrator Agent** — Conducts PH, BetaList, X, LinkedIn, email, Reddit, newsletter. *Tools:* dispatches all other agents, calendar, PH API, Slack/Discord. *Metric:* PH ranking, day-1 signups, $. *Model:* Opus for plan, Haiku for polling.

9. **Press / Journalist Outreach Agent** — Find journalists by beat, send pitches. *Tools:* Muckrack equivalent, Twitter list scraping, beat classifier. *Metric:* coverage, replies. *Model:* Sonnet.

10. **Influencer/Creator Outreach Agent** — YouTubers, podcasters, newsletter authors matched to ICP. *Tools:* YouTube Data API, Spotify, Substack scraper, beehiiv, Apify. *Metric:* reply rate, sponsorships. *Model:* Sonnet.

11. **Directory Submission Agent** — 100+ launch directories. *Tools:* Browserbase/Stagehand/Playwright MCP, CAPTCHA solver, image resizer. *Metric:* successful submissions, backlinks. *Model:* Haiku.

12. **Review/Testimonial Agent** — Surface happy users, request reviews. *Tools:* Stripe, PostHog cohorts, email, G2/Capterra APIs. *Metric:* reviews collected, avg rating. *Model:* Haiku.

13. **Newsletter / Email Sequence Agent** — Onboarding drip, nurture, weekly updates. *Tools:* Loops/Resend/beehiiv MCP, segmentation, A/B. *Metric:* open/click, activation lift. *Model:* Sonnet.

14. **Pricing Page Optimizer Agent** — Tests tiers, copy, anchors. *Tools:* PostHog A/B, Stripe, competitor scraper, WTP surveys. *Metric:* RPV, ARPU. *Model:* Sonnet + Opus analysis pass.

15. **Competitor Intel Agent** — Continuous monitoring of 5–10 competitors. *Tools:* Firecrawl change-detection, RSS, X listening, ChangeTower, Wayback. *Metric:* alerts driving PM decisions. *Model:* Haiku w/ Sonnet weekly synthesis.

16. **Feedback Triage Agent** — Routes bugs/requests/churn signals to Linear with severity tags. *Tools:* Intercom, Linear, GitHub, Slack. *Metric:* time-to-triage. *Model:* Haiku.

## 4. BYOK patterns

- **Cursor**: BYOK on every plan but gates Tab/Apply/Agent/Edit behind proprietary models — BYOK only powers Chat. Custom-trained models are the moat.
- **OpenRouter**: keys encrypted at rest, TLS 1.3, scoped sub-keys, Infisical integration.
- **Cline**: keys in OS credential manager (Keychain/Credential Manager) — never touch their servers.
- **Continue**: BYOK gated to Team/Company plans ($10/mo+).
- **Aider**: fully BYOK by design.

**For LaunchWings**: AES-256-GCM at rest with KMS per-tenant DEKs; never log; decrypt only in-process; scoped per agent (BYO Anthropic key for copy, BYO Apollo key for outreach); 30/60/90-day rotation reminders + zero-downtime rotation; even when BYOK, log token counts for observability + quota; keep proprietary "Founder Voice" embedding behind platform credits — that's the Cursor-Tab-style moat.

## 5. AI tier pricing benchmarks

| Product | Free | Mid | Top | AI model |
|---|---|---|---|---|
| Notion | $0 (20 lifetime AI) | Plus $10/seat | Business $20/seat (unlimited) | AI moved to bundled in 2026 |
| Linear | $0 (AI included) | Basic $10/seat | Business $16/seat | AI is *not* a price discriminator |
| ClickUp | $0 | Unlimited $7/seat | Business $12 + AI $5 add-on | AI as paid add-on |
| Intercom Fin | — | — | — | $0.99 per resolved conversation, 50/mo min |
| HubSpot Breeze | — | Pro $800/mo | Enterprise | $0.50 per resolved, $1 per recommended lead |
| Attio | $0 (3 users) | Plus $29/seat | Pro ~$69–86 | Hybrid: seat fee + workspace AI credits |

**Trend: outcome-based pricing wins.** HubSpot moved Breeze to per-result. Intercom Fin per-resolution. Maps perfectly to LaunchWings where success = signups/customers, not tokens.

## 6. MCP / tool ecosystem (~45)

**Search**: Perplexity, Exa, Tavily, SerpAPI, Brave Search, DataForSEO.
**Scraping/browser**: Firecrawl, Apify, Browserbase, Stagehand, Playwright MCP, ZenRows, ScrapingBee.
**Social**: X API, Reddit API, LinkedIn (Aimfox/Closely), Bluesky, Threads, Mastodon, YouTube Data API, TikTok scraper.
**Lead data**: Apollo, Clay, Hunter, Clearbit, RocketReach, ZoomInfo, MX validator.
**Email**: Resend, Loops, beehiiv MCP, Mailgun, Smartlead, Postmark, Lemlist.
**Analytics**: PostHog MCP, Mixpanel, Plausible, Stripe, Linear, GitHub, Vercel.
**Creative**: Flux/Ideogram, Runway, ElevenLabs, Canva API, Figma MCP, tweet image renderer.
**Launch directories**: ProductHunt API, BetaList, IndieHackers, Tiny Launch, AlternativeTo, Futurepedia, G2, Capterra, Trustpilot.
**Press/PR**: Muckrack-eq, Prowly, Substack search, Listen Notes (podcasts).
**Approval/comms**: Slack, Discord, Telegram, calendar (Google/Cal.com).

Subagents in Claude Agent SDK enforce tight tool scoping per agent via `allowedTools`.

## 7. Evals & guardrails

**Stack**: Phoenix (OSS, OTel-native, Claude Agent SDK support) for tracing + Braintrust for offline evals + scorecards in CI.

**Per-agent evals (v1):**

| Agent | Evaluator | Pass bar |
|---|---|---|
| Positioning | LLM-judge: "tagline mentions audience+problem+mechanism?" | ≥4/5 on 50-prompt golden set |
| Landing | A/B conversion lift, Lighthouse perf | +10% conversion, perf ≥90 |
| SEO | Embedding sim to top-3 SERP; hallucination detector | <2% hallucination |
| Cold outreach | Personalization classifier; spam-score | 100% spam pass, ≥80% personalization |
| Reddit | Toxicity/promotional classifier; subreddit-rule compliance | 0 removed |
| X/LinkedIn voice | Voice fidelity (style cosine) | ≥0.85 |
| Launch orchestrator | Plan-completeness, time-budget | 100% steps fired |
| Directory submission | Form-fill success, OCR match | ≥95% |
| Pricing optimizer | Bayesian RPV uplift | statistical sig |
| Competitor intel | Recall vs ground truth | ≥90% |

**Guardrails:**
- Monitor model (Haiku) on every outbound action: PII, brand safety, prompt-injection.
- Spend caps per user/agent/day with auto-pause.
- Reversibility classifier — irreversible actions require explicit approval regardless of autonomy mode.
- Honeypot detection for Reddit/X (never engage throwaway accounts).

## 8. Cost control

Pricing (May 2026): Opus 4.7 $5/$25, Sonnet 4.6 $3/$15, Haiku 4.5 $1/$5 per Mtok.

**Stack:**
1. **Three-tier routing** — Haiku 60% (form-fill, classify, poll), Sonnet 30% (default copy, plan), Opus 10% (launch-day plan, pricing analysis). 50–80% cost reduction.
2. **Prompt caching** — 90% discount on cached input. Cache system prompt + tool defs + brand context.
3. **Batch API** — 50% off, 24h SLA. Use for SEO programmatic pages, weekly Competitor Intel, review-request blasts. Combined with caching: up to 95% savings.
4. **Distillation** — fine-tune Haiku on best Sonnet outputs for Founder Voice after 1000 user samples. Cuts top-volume agent ~70%.
5. **Critic-Refiner** — Haiku critic on Sonnet producer cheaper + better than running Opus once.
6. **Subagent context isolation** — fresh context windows prevent quadratic context growth.

**Estimated COGS / launch (Pro, 30-day campaign):** ~$56 raw → **~$17 after cache+batch** + tool costs ($8–15) = **$25–32 all-in COGS per launch**. Comfortably below $39 Pro tier (1 launch/mo) and small fraction of $99 Business with multiple launches.

## Sources

Lindy, TrueFoundry, Gumloop, Zapier Agents survey, Devin 2.0 deep dive, Claude Agent SDK docs, OpenAI Operator/CUA, Cursor BYOK, OpenRouter BYOK, Cline auth, Continue pricing, Notion/Linear/ClickUp/Intercom/HubSpot/Attio pricing, PulseMCP, PostHog MCP, ZenRows scraping MCP, Phoenix Arize, Braintrust Langfuse alternatives, Anthropic pricing, Anthropic prompt caching, LaunchDirectories alternatives.
