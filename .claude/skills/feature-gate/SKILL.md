---
name: feature-gate
description: Quick scope-check before doing ANY work that touches a feature. Lighter than /critical-decision — use for "is this in v1?" / "does this displace anything?" / "which feature does this belong to?" Runs in under a minute. Invoke at the START of any task that adds new behavior, not just bug fixes.
---

# Feature Gate

> A 60-second scope check. Use before writing code that changes user-visible behavior.

## When to invoke

- Before starting any task that adds a new feature, screen, agent, connector, or capability.
- Before estimating work for a ticket.
- When a customer / user request comes in.

DO NOT invoke for:
- Bug fixes within existing accepted features.
- Refactors that don't change user-visible behavior.
- Adding tests / evals to existing features.
- Documentation-only changes.

## The 6 questions

Answer each in ≤2 sentences.

### 1. Which feature does this map to?

Look up `docs/product/PRD.md`. The v1 surface is F1 (Today's Plan), F2 (Inbox Triage), F3 (Cohort Channel Picker), plus F5–F8 (safety pipeline, attribution rail, cohort warehouse, take-rate billing), exposed through P1/P2/P3 plug-points. If the proposal doesn't fit, that's a smell — likely a `/critical-decision`.

### 2. Is it in v1?

Per `docs/product/PRD.md §"Out of scope (v1)"`. If the proposal expands beyond launch-side / requires deploy or hosting / introduces multi-org / asks for translations → defer.

### 3. Is it on the explicit "do not build" list?

Per `docs/product/PRODUCT.md §"What v1 explicitly does not do"`. If yes — defer or escalate.

### 4. What does it displace?

If the answer is "nothing," you're either underestimating or you've found free time. Be honest about what slips.

### 5. Does it survive the moat-replaceability gate?

Could a founder install one or two free Claude plugins (`claude plugin install claude-seo`, `claude plugin install marketing`) and get 80%+ of the proposed value today? If yes, the proposal is bundled-commodity, not a pricing-wedge feature. Reread `docs/decisions/0005-outcome-aligned-take-rate.md` before pushing through.

### 6. Pre-mortem trip-wires

Per `docs/operations/PRE_MORTEM.md` §"Trip-wires." If any are red right now, no new scope until the trip-wire is green.

## Output

```
MAPS TO: F# / P# / bundled-commodity / off-roadmap
PHASE: v1 / out-of-scope / kill-listed
DISPLACES: [feature/none]
MOAT-REPLACEABLE: [yes/no — if yes, what's the operational/Connect-billing/cohort hook?]
TRIP-WIRE STATUS: [green/yellow/red]
DECISION: [Proceed / Re-scope / Defer / Escalate to /critical-decision]
ONE-LINE WHY:
```

If "DECISION: Escalate," stop here and run `/critical-decision`.
