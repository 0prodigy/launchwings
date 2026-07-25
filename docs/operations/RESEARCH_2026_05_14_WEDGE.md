# Wedge re-research snapshot — 2026-05-14

Captured during the LaunchWings wedge re-think. Three independent
research streams (B2B AI pull / failure patterns / function-by-function pain)
run in parallel against 2026 primary sources. Filter: no Twitter, no
indie-hacker threads, no vendor marketing.

Status: pre-decision. Wedges proposed at the bottom are CANDIDATES, not
chosen. Decision pending user direction.

---

## Cross-cutting findings

### What's structurally different in 2026 vs 2025

1. **Renewal-cycle accountability flipped the buyer posture.** Menlo's 2025
   enterprise survey: 86% raised AI budgets, **only 29% can measure return**.
   FY26 renewals are the first time CFOs are demanding the ROI answer.
2. **Buyer moved down-org.** Department leads now own 24% of AI purchase
   decisions (up from 18%). VP-level approval threshold ~$75K. The 2026
   wedge target is a *VP with a renewal coming up*, not a CIO running a
   six-month evaluation.
3. **Procurement gates hardened.** SOC 2 Type II + NIST AI RMF mapping +
   queryable audit log + permission-aware retrieval + bounded-autonomy mode
   are now gates *before* technical eval is granted. Air Canada / Replit /
   Cursor "Sam" / Klarna / 11x precedents made buyers gun-shy.
4. **76% of enterprise AI is bought, not built** (up from 53% in 2024).
   Buyers stopped waiting on internal platform teams.

### What failed in 2025-2026 — avoid these

| Category | Evidence | Why it died |
|---|---|---|
| Autonomous AI SDR | 11x.ai pullout (ZoomInfo: "performed significantly worse than our SDR employees"), AI SDR category GRR ~40% vs SaaS norm 63%, 12-18% hallucination | Buyer can't trust outbound that fabricates account data |
| End-to-end CS replacement | Klarna reversed; DPD; Cursor "Sam"; Air Canada liability ruling | Empathy/nuance cliff + liability on hallucinated policy |
| "Build software with AI" for non-tech | Builder.ai bankrupt ($445M burned); Replit prod-DB wipe (Jul 2025) | No safety envelope around the LLM |
| General-purpose agent builders | G2: 770 reviews across 7 vendors, category saturated | White space closed at "build an agent" layer |
| Generic enterprise copilots | Microsoft Copilot 35.8% paid-seat activation; 76% prefer ChatGPT | Unmet need moved one layer up — adoption + ROI proof |
| Marketing Ops / GTM Engineering tooling | Clay + Default + Common Room + Pocus + Unify + Persana all chasing | Crowded; needs very narrow sub-wedge |
| Generic finance close-automation | Ramp + Brex + Numeric + Tabs + Puzzle + Light | Dominant incumbents |
| Enterprise CLM | Ironclad + SpotDraft + Juro consolidating | Locked up; $50K+ ACV excludes mid-market |
| AI Cold Email | Reply rate 5%→3.43% (2025→2026); 69% of decision-makers say AI email "actively bothers them" | Structural buyer fatigue |

### What the 2026 buyer now requires (procurement gates)

- SOC 2 Type II + NIST AI RMF mapping — filtered before demo
- Queryable, immutable audit log exportable to SIEM
- Permission-aware retrieval (agent inherits requesting user's ACLs)
- Bounded autonomy: explicit deterministic-vs-agentic zones per workflow,
  "planning-only" mode buyers ask for by name
- Eval harness against buyer's own data during pilot — not vendor benchmarks
- Named human-in-the-loop escalation with SLA + context handoff
- Monthly outcome reporting vs human baseline, CFO-presentable

Buyer posture in one sentence:
**"Show me bounded autonomy, permission-aware data access, and outcome
evidence on my data — or I won't pilot."**

---

## The candidate wedges (3 finalists after filtering)

### Wedge A — AI Quality / Eval / Observability for Production Agents

| Field | Detail |
|---|---|
| Job-to-be-done | "Stop my deployed AI agents from silently regressing between model updates and prove they're working to my CFO at renewal" |
| Buyer | Head of AI / VP Eng / new named role "AI Quality Lead" or "AI Ops Lead" |
| Budget center | Existing AI platform line item — defensive spend to protect ongoing AI investments |
| Pull signal | MIT NANDA: 95% of GenAI pilots no P&L impact; IDC: 88% agent pilots never reach prod; Replit/Klarna/11x failures all root-caused to "no continuous eval on production traffic" |
| Why incumbents can't kill it | Anthropic/OpenAI/Google won't ship multi-vendor observability (conflict of interest — would mean grading themselves vs competitors). Datadog/Splunk are generic APM, not eval-aware. Braintrust/Langfuse/Patronus exist but are dev-tool framed, not ops-team framed |
| Cold-start | Works for a single customer day 1 — runs evals on their workflows, catches regressions. No multi-tenant cohort needed for value |
| Compounding moat | Pattern library of regression types across customers — "this prompt drifted on Claude Opus 4.7 upgrade, here's the fix" — becomes proprietary IP that grows with usage |
| Saturation risk | Medium-high — Braintrust ($, public), Langfuse (OSS), Patronus, Galileo, Helicone all in space. Repositioning gap is "ops product for AI Quality Lead persona" vs "SDK for ML engineer" |
| First customer test | Find 5 mid-market SaaS that paid for an AI agent in 2025 and are at renewal review in next 90 days. Pitch: "we'll prove your AI works by your renewal date" |

### Wedge B — AI Governance & Compliance (ISO 42001 + EU AI Act)

| Field | Detail |
|---|---|
| Job-to-be-done | "Produce continuous, audit-ready evidence that our AI deployments comply with ISO 42001 and the EU AI Act, without me hand-rolling controls" |
| Buyer | **Named role: AI Governance Lead / AI Compliance Manager.** 1,400+ US LinkedIn postings April 2026, median $158,750 salary, IAPP confirms $150-200K band |
| Budget center | Net-new regulatory budget — not displacing existing tools, created by ISO 42001 / EU AI Act compliance deadlines |
| Pull signal | ISO 42001 published 2023; EU AI Act phasing in through 2025-2027; Strata: 68% rate HITL "essential/very important" but no standard tool; Vanta/Drata reviewers say "checkbox compliance, doesn't cover AI-specific frameworks" |
| Why incumbents can't kill it | Vanta/Drata are SOC 2 / HIPAA / ISO 27001 first — adding AI-specific frameworks is a strategic detour for them. Hyperscalers won't audit themselves. 12-18 month window before Vanta/Drata catch up |
| Cold-start | Works for a single customer day 1 — they need evidence for one audit. No cohort needed |
| Compounding moat | Control templates, evidence patterns, attestation library, mapping between AI vendors and framework controls. Grows with each customer audit |
| Saturation risk | Low-medium — net-new category. Risk is Vanta extension |
| First customer test | Find 5 mid-market companies with AI deployments and an EU customer / regulatory exposure. Pitch: "we'll get you ISO 42001 evidence in 30 days" |

### Wedge C — AI ROI Attribution for the CFO

| Field | Detail |
|---|---|
| Job-to-be-done | "Prove the ROI of every AI tool we pay for, in time for renewal, in a format my CFO accepts" |
| Buyer | CFO / VP Finance / Head of RevOps at renewal time |
| Budget center | Finance ops — pulled from the AI-tools renewal budget itself ("you're saving us from a $200K renewal mistake") |
| Pull signal | Menlo 2025: 86% raised AI budgets, 29% can measure ROI. Every vendor's renewal at risk. Universal pull |
| Why incumbents can't kill it | Multi-vendor by definition. No first-party AI vendor will honestly measure their own ROI. Existing FinOps tools (Vantage, CloudZero) are infra-cost focused, not AI-outcome focused |
| Cold-start | Works for single customer day 1 — instrument their AI usage, produce ROI report. No cohort needed |
| Compounding moat | Cross-customer benchmarks ("Glean ROI median across N similar customers") become a defensible benchmark moat — but only after k≥30 in vertical |
| Saturation risk | Low — emerging category. Risk: gets reduced to a dashboard / consulting service if execution isn't sharp |
| First customer test | Find 5 mid-market SaaS in renewal review for a $50K+ AI tool. Pitch: "we'll have your ROI evidence before your renewal call" |

---

## What this snapshot deliberately does NOT include

- Pricing model — per current direction, pricing follows need. Wedge first.
- Stack / architecture — premature. Decided after wedge confirmed.
- Moat-engineering details (cohort warehouse, attribution rail) — premature.

## Open questions for the user before doc rewrites

1. Which of A / B / C lands best? Or is there a fourth direction we're missing?
2. Is there a personal-fit or distribution advantage that biases one over
   the others? (e.g., existing relationships in compliance, eng leadership,
   or finance)
3. Speed-to-pilot tolerance — do we want a wedge that gets to a paid pilot
   in <30 days or are we OK with 90-day enterprise cycles?

---

## Source pointers (primary research outputs in transcript)

Three agent runs returned with cited sources. Full transcripts available in
session. Top sources by stream:

- **Pull research**: Menlo VC 2025, IDC, Gartner April 2026, G2 State of AI
  Agent Builders 2026, Microsoft Agent 365 launch coverage, Strata 2026
  Agentic Identity research.
- **Failure research**: MIT NANDA State of AI in Business 2025 (95%
  pilots fail), McKinsey State of AI 2025, Deloitte State of AI 2026, Bain
  India Enterprise Tech 2026, TechCrunch coverage of 11x.ai / Builder.ai /
  Klarna / Replit / DPD / Cursor "Sam" / Air Canada.
- **Function-by-function**: Tellius/ZoomInfo RevOps 2026, Kyle Poyar 2026
  State of AI for GTM, Inkeep 2026 CS measurement guide, getDX Q1 2026 AI
  Impact Report, Faros AI Productivity Paradox, Axial Search AI Governance
  Jobs Jan 2026, CFO Connect State of AI in Finance 2026.
