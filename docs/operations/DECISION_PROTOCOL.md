# Decision Protocol

> How LaunchWings makes decisions during the build. Built around the agents in `.claude/agents/` and the skills in `.claude/skills/`.

## The two-tier protocol

Every decision falls into one of two tiers:

### Tier 1 — Routine (use `/feature-gate`)

Cheap to run (60 seconds). Use BEFORE starting any task that adds user-visible behavior.

Outcome: **Proceed**, **Re-scope**, **Defer**, or **Escalate to Tier 2**.

### Tier 2 — Critical (use `/critical-decision`)

Spawns perspective subagents in parallel and records an ADR. Use for anything that:

- Costs >1 engineer-week to implement.
- Could damage brand / trust / IP reputation.
- Changes the wedge, ICP, or pricing.
- Adds a new third-party service of importance (Anthropic-tier).
- Crosses an architectural Rubicon (database, auth, billing, agent runtime).
- Onboards a new connector / channel / integration.
- Accepts a customer outside ICP.

Outcome: a recorded ADR in `docs/decisions/` with perspectives, displaces-from-MVP, and reversal-cost.

## Examples

| Situation | Tier | Reason |
|---|---|---|
| "Should I add a `useDebounce` hook?" | None | Not user-visible / not new behavior. |
| "Add a tooltip to the LRS ring." | T1 | UI tweak; in-bundle. |
| "Add a 'mark resolved' button to checklist items." | T1 | New behavior, but in-bundle. |
| "Add a new evaluator to Stage 1 checklist." | T1 | In MVP cut; bounded scope. |
| "Add a new connector for Threads." | T1 → likely T2 | Confirm in MVP cut; if not, escalate. |
| "Add Reddit Ads orchestration." | T2 | New channel + outbound + spend. ADR. |
| "Switch from Trigger.dev to Inngest." | T2 | Architectural Rubicon. ADR. |
| "Build the GitHub-deploy capability." | T2 | Done — see ADR-0002. |
| "Add an Agency tier." | T2 | New ICP cohort. ADR. |
| "Sign a paid customer in fintech regulated space." | T2 | Anti-ICP. ADR. |

## When the operator IS the human (founder)

The founder may make top-of-house calls without invoking `/critical-decision`. The agents inform but cannot veto a founder decision. **However**: write the ADR anyway, even if it's the founder's edict — future-you and future-engineers need the trail.

## When agents disagree

| Disagreement | Resolution |
|---|---|
| @ceo says no, @cto says yes | @ceo wins — the wedge is the wedge. |
| @cto says no, @ceo says yes | @cto wins on architecture; if bypassed, flag in ADR with explicit risk acceptance. |
| @safety-lead VETO | Veto stands. @safety-lead must propose a minimum acceptable version. |
| @growth-lead says no, others yes | Growth's "no" downgrades to "review impact in 30 days" rather than block. |
| Subagent dissent in `/critical-decision` | Surface explicitly in ADR; do not paper over. |

## Cadence

- Every Sprint Monday: review trip-wires (`PRE_MORTEM`).
- Every Sprint Friday: review ADRs filed in the past week. Anything we'd reverse?
- Every Month: re-run `/critical-decision` on the largest open scope items if the world has changed.

## What this protocol prevents

1. **Scope drift** — every yes costs something explicit (the "displaces from MVP" field).
2. **Tribal knowledge loss** — ADRs document the *why* not just the *what*.
3. **Drift in agent behavior** — agent prompts are production code; changes go through ADR.
4. **Founder over-extending** — agents are antibodies against "this feature feels substantial" thinking.
5. **Over-reliance on agents** — the founder remains decision-maker; agents inform.
