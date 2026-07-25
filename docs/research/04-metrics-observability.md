# Research Dossier 04 — Metrics, Insights & Observability

*Source: parallel research agent, May 2026.*

## 1. Metric framework

Anchor on **AAARRR** (operational funnel) + **North Star Metric** (rallying number) + **Sean Ellis PMF** (qualitative).

### NSM templates by product type
- SaaS default: **Weekly Active Paying Users (WAPU)** = unique paid users with ≥1 core action in 7d.
- Marketplace: GMV booked.
- Content/AI tool: Successful generations per week.

Auto-decompose: WAPU = Paid Users × % Active × Avg Sessions/Active User (Reforge breadth × depth × frequency × efficiency).

### AAARRR exact metrics & 2026 benchmarks

| Stage | Metric | Formula | Benchmark |
|---|---|---|---|
| Awareness | Impressions, Reach | Σ unique exposures / channel | — |
| Acquisition | Visitor → Signup CR | signups / unique visitors | 1.5–2.5% avg, 8–15% top decile |
| Activation | Signup → Aha CR | users hitting "aha" / signups | 25–40% PLG, 15–35% trial |
| Retention | Day-N Retention, WAU/MAU | active in week N / cohort; stickiness | DAU/MAU >20% strong |
| Revenue | Trial→Paid | paid / trials | 4–6% no-CC; 25–35% with CC |
| Referral | K-factor | invites × conversion | K>1 viral |

### PMF & unit economics
- **Sean Ellis Score:** ≥40% answer "very disappointed" if product disappeared = PMF. Run quarterly, segment by persona (Superhuman 22% → 58% by segmentation).
- **Retention curve flattening:** week-4+ must asymptote, not decay to zero.
- **NRR:** best-in-class >120%.
- **Activation Rate, TTV:** TTV target <60 min for solopreneurs.
- **Aha moment** defined statistically — action whose week-1 completion best predicts week-8 retention (logistic regression with lift threshold).
- **CAC payback** target <12 months. **LTV:CAC** 3:1–5:1. **Rule of 40** post-T2D3, ≥$1M ARR. **SaaS Magic Number** = (ΔARR × 4)/S&M prior Q; >0.75 efficient. **Quick Ratio** = (new + expansion) / (churn + contraction).

## 2. Conversion analytics — our unique angle

We orchestrated the launch ourselves → we know causal chain end-to-end without third-party cookie loss or post-iOS14 attribution gaps.

Industry tools and gaps:
- **PostHog**: funnels/paths/replay; weak on launch orchestration.
- **Amplitude**: multi-touch, predictive cohorts, "Ask Amplitude" NL queries.
- **Mixpanel**: Spark AI for NL queries, expanded back into A/B + replays + heatmaps.
- **June.so**: B2B auto-reports.
- **Heap**: auto-capture + Illuminate friction scoring + multi-touch attribution.

**LaunchWings unique:**
1. **Attribution by channel × message × creative × agent run** — every visitor carries a deterministic UTM/launch_id we minted. Linear, U-shaped, time-decay, and Markov-chain removal-effect models for incrementality.
2. **AI Experiment Lift:** every AI-generated copy/creative is a treatment arm. Bayesian lift with 95% credible intervals.
3. **Channel ROAS in real time:** revenue / channel cost computed every 5 minutes during launch.
4. **Funnel velocity:** median time between funnel steps per channel.
5. **Counterfactual estimator:** hold-out cells per cohort to estimate baseline conversion absent agent action.

## 3. AI agent observability

Stack: **Phoenix (OSS, OTel-native, Claude Agent SDK support)** for tracing + **Braintrust** for offline evals + scorecards in CI. Langfuse acquired by ClickHouse Jan 2026; Helicone leads gateway-level minimal-friction.

**Trace structure (OTel):**
- `Session` (founder goal: "Launch X on Tuesday")
  - `Run` (agent attempt)
    - `Span: LLM call` — model, tokens, cost USD, latency ms, temp
    - `Span: Tool call` — name, args, success bool, retry count, latency
    - `Span: Retrieval` — query, k, hit rate, doc IDs

**Founder-facing metrics:**

| Metric | Definition | Alert threshold |
|---|---|---|
| Tokens per outcome | tokens / successful outcome | >2× 30-day median |
| Cost per launch milestone | $ / activation/conversion | spec'd per plan |
| Latency p50 / p95 / p99 | per agent skill | p99 >30s |
| Tool-call success rate | succeeded / attempted | <95% |
| Retry rate | retries / total | >10% |
| Hallucination flags | low-conf + grounding-fail rate | per Luna/HaluGate (76–162ms overhead) |
| Goal-completion rate | sessions ending at intended state | <80% |
| Human-override rate | how often founder edits agent output | rising trend = drift |

Hallucination flags via token-level entropy (K<10 logprobs sufficient) + RAG grounding check. Surface in plain language: "Yesterday Cold Email Agent had 14% grounding failures on prospect company facts — likely model drift."

## 4. Insight Agent (4 layers)

Comparable: Heap Illuminate, Amplitude Ask, Mixpanel Spark, PostHog Max AI.

**(a) Signal layer** — continuous scan:
- Anomalies (z-score >3 rolling 28-day; EWMA gradual drift; Prophet seasonal)
- Cohort regressions (week-N retention drop >2σ vs prior cohorts)
- Funnel drop-offs (step CR drops >1σ)
- Channel decay (CAC trending up >20% WoW)
- Churn-risk users (logistic on engagement decay)

**(b) Diagnosis** — root-cause comparisons across segments (device, channel, plan, geo, pricing experiment, agent version) → dominant explainer via uplift-tree.

**(c) Recommendation** — action card: "Conversion X→Y dropped 18% Tuesday. 73% attributable to Twitter mobile Safari. Suggested: A/B test simplified mobile signup. [Run Experiment]"

**(d) Action** — because we own orchestration, founder can one-click execute.

NL query interface ("Ask LaunchWings") translates founder questions to SQL+chart, plus proactive briefs.

## 5. Privacy-preserving cross-cohort benchmarks

We uniquely own ground-truth conversion data across the entire user base (not surveys).

- **k-Anonymity (k≥50):** any benchmark cell aggregates ≥50 founders matching slice (vertical, ARR band, launch type). Suppress otherwise.
- **Differential privacy (ε≤1.0):** Laplace noise on means.
- **l-diversity:** ≥3 distinct values per quasi-identifier.
- **Opt-in default with kill switch.**

Metrics: percentile of your launch-day conversion vs cohort, MRR growth percentile, channel-mix delta, time-to-PMF percentile. "You are at p72 for trial→paid among AI-tools founders <$10k MRR."

Premium **Open Launches** view (Baremetrics-style) opt-in to publish — viral marketing for them, social proof for us.

## 6. Engagement loops (keep founders daily)

Reference: Duolingo (7-day streakers 3.6× more likely to retain; Streak Freeze cut at-risk churn 21%; iOS streak widget +60% commitment), Strava, Linear, Whoop.

1. **Morning Brief (6am local)** — email + push: yesterday's KPIs vs goal, top insight, one suggested action.
2. **Launch Streak** — consecutive days founder ships something. Streak freeze for weekends.
3. **Daily Standup Digest in Slack** — pinned summary, tappable.
4. **Weekly Wrap-Up Email (Sunday 6pm)** — cohort retention, MRR delta, percentile vs benchmarks, biggest win + biggest risk.
5. **Founder Leaderboards** — opt-in, by ARR band: "Top 10 fastest activation rates this month."
6. **Smart push notifications** — only signal-worthy events. Cap 2/day.
7. **Milestone Confetti** — first $1, $100 MRR, first 10 paying customers, first churn.
8. **Comeback Mechanism** — at risk-of-lapsing (no login 5d), morning brief = single line "Here's the one thing to do today."

## 7. Dashboards to ship (8)

### 7.1 Launch Day Live Dashboard
- Charts: real-time visitor counter (5s refresh), upvotes (PH API), conversion funnel sparkline, channel sankey, geo heatmap, top-creative leaderboard, agent action stream, comment sentiment gauge.
- Sources: orchestration events, PH API, X API, web analytics, Stripe.
- Alerts: traffic spike >3σ, conversion dip >2σ, payment failure rate >2%, page error >1%.
- Cadence: hot 48h, then archived as launch retro.

### 7.2 Channel Attribution Dashboard
- Charts: revenue by channel (linear/U-shaped/time-decay/Markov toggle), CAC by channel by week, ROAS, funnel CR by channel, time-to-conversion histogram.
- Alerts: channel CAC up >20% WoW, ROAS <1, model-attribution drift >30%.

### 7.3 Agent Performance Dashboard
- Cost-per-outcome, latency p50/p95/p99, tool success rate, hallucination flag rate, token usage trend, human-override rate, eval pass rate.
- Alerts: p99 >30s, cost-per-run >2× median, success <95%, override rate trending up >5pp WoW.

### 7.4 Conversion Funnel Dashboard
- Stepwise CR with CIs, time-between-steps histogram, segmented funnels, drop-off Sankey.
- Alerts: any step CR drop >2σ; segment-level alerts.

### 7.5 Cohort Retention Dashboard
- D/W/M curves by signup cohort, retention triangle heatmap, MAU layer cake, Kaplan-Meier survival, payback period by cohort.

### 7.6 Revenue / MRR Dashboard
- MRR waterfall (new/expansion/contraction/churn/reactivation), ARR trend, ARPU, NRR, GRR, MRR by plan, dunning recovery.

### 7.7 Audience Growth Dashboard
- List growth by source, engagement rates, top content by audience-formation, K-factor.

### 7.8 Competitor Intel Dashboard
- Competitor launch calendar, share-of-voice, pricing changes, hiring signals, public review velocity.

## 8. Anomaly detection without fatigue

**Layered stack:**
1. **Statistical baseline:** rolling 28-day z-score, IQR for fast outliers.
2. **EWMA-STR** (over Season-Trend residuals) — small/gradual shifts traditional thresholds miss.
3. **Prophet** — seasonality+trend, flag outside 95% PI.
4. **Isolation Forest / Random Cut Forest** — multi-dim anomalies.
5. **CUSUM** — sustained shifts (regime change in churn).

**Anti-fatigue policy:**
- Severity tiers: P0 page (revenue-impacting), P1 push, P2 morning brief, P3 weekly digest only.
- Rate-limit: max 2 push/day, 5 emails/day.
- De-dup window: collapse repeats within 4h.
- Confidence threshold: fire only when P(anomaly) >0.9 AND business impact >$X.
- Feedback loop: "Mark not useful" trains per-founder relevance model. 3× consecutive dismissals raises threshold automatically.
- **Always pair signal with action** — every alert ships with a one-click remediation.

## Differentiation summary

We do NOT compete on event-tracking quality (Mixpanel/Amplitude have moats). We compete on three vectors only LaunchWings can serve:

1. **Causal attribution** of launch outcomes — because we fired the actions.
2. **Agent observability fused with business outcomes** — token cost per dollar of MRR, not per call.
3. **Cross-founder benchmarks with privacy-preserving aggregates** at granularity (launch type × vertical × stage) no other tool has.

Layered with retention design from Duolingo/Whoop and an Insight Agent that closes the loop by *taking action* rather than just charting it, this becomes the analytics surface mature founders won't churn off, even when they could afford Mixpanel.

## Sources

Amplitude AAARRR, PostHog AAARRR, Reforge NSM, Sean Ellis 40% PMF, First Round Superhuman, SaaS Hero/CausalFunnel/Kirro/Artisan benchmarks 2026, CloudZero Rule of 40 + Magic Number, Pelanor, Airtree LTV/CAC, Wall Street Prep, Fiscallion, PostHog vs Mixpanel, PostHog Heap alternatives, Genesys Growth Amplitude/Mixpanel/Heap 2026, Mixpanel Spark, Latitude/Laminar/Braintrust LLM observability 2026, TokenMix LangSmith vs Helicone vs Braintrust, Digital Applied agent observability 2026, Helicone, Arize Phoenix, vLLM HaluGate, arXiv hallucination/Luna/token entropy, Baremetrics, ChartMogul, Stripe Sigma, k-anonymity/DP papers, TryPropel/Sensor Tower/Trophy Duolingo, Linear notifications, Whoop, OpenObserve, IEEE EWMA/CUSUM, GrabNGoInfo Prophet, Twilio/Northbeam/Adobe/HubSpot multi-touch attribution, Hunted.space, PH launch day, Get Stream / Finmark / Userpilot NSM.
