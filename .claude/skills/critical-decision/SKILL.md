---
name: critical-decision
description: Use BEFORE making any non-trivial product, technical, scope, or strategic decision. Spawns 3 perspective subagents in parallel (or invokes @ceo / @cto / @growth-lead / @safety-lead as appropriate), records the deliberation as an ADR in docs/decisions/, and forces displacement-tracking. Examples — "should we build X in v1?", "should we change pricing?", "should we add a 17th agent?", "should we partner with X?", "should we accept this customer's anti-ICP request?"
---

# Critical Decision Protocol

> Before any decision that costs >1 engineer-week to implement OR can damage brand/trust, run this protocol. The cost of pausing to deliberate is hours; the cost of building the wrong thing is months.

## When to invoke

ALWAYS run this skill for:

- Adding/removing a feature from the MVP cut.
- Changing pricing, tiers, or limits.
- Adopting a new third-party service (Anthropic-tier importance).
- Onboarding a new connector/channel.
- Accepting a customer outside ICP.
- Architectural decisions that bind us for >3 months.
- Brand / messaging / positioning changes.
- Anything that changes the wedge.

DO NOT run for:

- Trivial bug fixes.
- UI tweaks within an already-approved screen.
- Adding a new test / eval.
- Within-bundle implementation details.

## The protocol (5 steps)

### 1. Frame the decision (you, the operator)

Write a 1-paragraph problem statement. If you can't, you don't understand the decision yet.

Required fields:
- **Question (one sentence, ends with "?")**.
- **Why this came up now.**
- **Reversibility (low / medium / high)**.
- **Estimated cost if we get it wrong.**
- **Deadline for decision.**

### 2. Decide which perspectives to invoke

Pick 3–5 perspectives. Default council:
- **@ceo** — strategic / wedge / scope.
- **@cto** — technical / stack-manifest / failure modes.
- **@growth-lead** — funnel impact / loops / pricing.
- **@safety-lead** — abuse / ToS / brand risk.

Add 1–2 external research subagents for any decision involving:
- Customer demand (Solopreneur Needs perspective).
- Engineering reality (an Engineering Reality perspective with web search).
- Competitive landscape (Strategic Fit perspective with web search).

Send all of them in **a single message with multiple Agent tool uses in parallel**. Cap each prompt at ≤700 words; specify desired length of response (≤600 words each).

### 3. Synthesize, don't average

Each perspective is a vote, NOT a weighted average. Strong objections from @safety-lead or @ceo are vetoes. Strong concerns from @cto must be addressed in the ADR.

Look for:
- **Unanimity** — proceed with confidence.
- **Strong dissent** — surface it explicitly in the ADR; do not paper over.
- **Surprising new info** — the perspectives often surface data the operator didn't have.

### 4. Write the ADR

Use `docs/decisions/0001-adr-template.md`. Increment number. Required sections:

- Status (default: Accepted).
- Context (link relevant docs by file:line).
- Decision (one paragraph).
- Perspectives consulted (≤2 sentences per voice, with agent ID).
- Consequences (positive + negative + accepted risk).
- Pre-mortem trip-wires affected.
- What this displaces from MVP.
- Reversal cost.
- Required spec updates.
- Related decisions.
- Date.

If "Reversal cost" is not low and you don't have unanimous consent, **stop and ask the human**.

### 5. Propagate spec updates

If the ADR requires changes to PRD/SYSTEM/VISION/etc., create a tracking checklist in the ADR's "Required spec updates" section, and ensure those changes ship within 1 sprint.

## Example invocation (for the operator using this skill)

```
> Decision: should we add an Ads Agent (Meta + Google) in v1?

[1] Frame:
- Q: Should LaunchWings v1 ship paid-ads orchestration?
- Why now: founder asked
- Reversibility: medium (orchestration code can be deleted; channel reputation harder)
- Cost if wrong: ~8 engineer-weeks displacing keystone Bundle 5
- Deadline: end of week

[2] Perspectives (parallel):
- Subagent: "Solopreneur paid-ads behavior — do they spend $ ads pre-PMF?"
- Subagent: "Engineering — Meta Marketing API access tiers, build effort"
- @ceo, @cto, @growth-lead, @safety-lead

[3] Synthesize (single message, see results)

[4] Write ADR-0003

[5] Update PRD.md if scope changes
```

## Anti-patterns (don't)

- Skipping the council "because the answer is obvious." If it's obvious, the ADR takes 5 minutes — do it anyway for the audit trail.
- Re-running the council with biased prompts to flip a "no" to a "yes."
- Accepting an ADR with no "displaces from MVP" entry. Every yes costs something.
- Treating @safety-lead's veto as advisory.
- Making the decision in chat without writing the ADR. Future-you and future-engineers need the trail.
- Spinning up 5 perspective agents for every UI tweak. Use judgment.

## When the operator IS the human

This skill is for Claude Code instances making decisions during the build. The human founder makes top-of-house decisions; the council may inform but not override the founder. Treat the founder's instruction as a final-pass perspective, not subject to veto by sub-agents.
