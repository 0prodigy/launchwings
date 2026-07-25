# Claude Code Agents & Skills for LaunchWings

> This directory contains the agents and skills that govern how the team builds LaunchWings. They are NOT the agents we ship to customers (those live in `packages/agents/` once we start coding). These are **internal stewards** that enforce our wedge, our stack, and our pace.

## Agents (reusable team members)

Located in `.claude/agents/`. Each is a markdown file with frontmatter + system prompt. Invoke via the Agent tool with `subagent_type: "<agent-name>"`.

| Agent | Role | When to invoke |
|---|---|---|
| `ceo` | Strategic alignment guard | Any feature/decision affecting strategy, scope, ICP, pricing, or the wedge |
| `cto` | Technical alignment guard | Any technical, architectural, or build-vs-buy decision |
| `growth-lead` | Distribution & retention | Any decision affecting acquisition, retention, ICP messaging, virality |
| `safety-lead` | Brand & reputation guard (veto power) | Any change affecting outbound content, third-party API calls, BYOK, audit, ToS |
| `devops-product` | Hosting / deploy / domain bridge | Per ADR-0002, v1 = audit/debug only; v2 = scope & design |

**Pairing patterns:**

- Strategic + technical = `@ceo` + `@cto`.
- Anything outbound = `@safety-lead` AUTO-INVOKED (veto power).
- Funnel/loop questions = `@growth-lead`.

## Skills (workflows)

Located in `.claude/skills/<name>/SKILL.md`. Invoke via the Skill tool.

| Skill | Purpose |
|---|---|
| `critical-decision` | Spawn 3–5 perspective subagents in parallel + record an ADR. Use BEFORE any non-trivial product/technical decision. |
| `feature-gate` | 60-second scope check. Use BEFORE starting any task that adds new behavior. |
| `dogfood-launch` | Orchestrates LaunchWings's own launch (we are our first ICP). |
| `find-domain` | 7-step playbook for picking and registering a domain. Codified from ADR-0004 (our own naming exercise). Reusable for sub-brands and eventually for customers. |
| `deploy-from-github` | INTERNAL ONLY. Takes a GitHub repo to a live URL on Vercel + Cloudflare DNS in 10 steps. Per ADR-0002 + ADR-0003: not a customer feature in v1; informs the eventual v3 customer feature. |

## Decision protocol — the short version

Before doing any new work:

1. **Run `/feature-gate`** — does this fit the MVP cut? (60 seconds)
2. **If escalated → `/critical-decision`** — spawn perspectives, record ADR. (15–30 minutes)
3. **Implement only after ADR is recorded.** No exceptions for "I'll write the ADR later."

The full protocol is in `docs/operations/DECISION_PROTOCOL.md` (to be written next).

## Why these agents exist

The previous attempt at a similar product failed in part to scope drift and "this feature feels substantial" thinking. The pre-mortem (`docs/operations/PRE_MORTEM.md`) catalogs 27 ways this product dies in Year 1. The agents are the antibodies.

Think of them as **friction at the right moments** — not bureaucracy, but trip-wires that stop the team from drifting toward MVP+ when MVP isn't done. In the founder's words: "all parallel things come together at some point to contribute to main goal."

## Adding new agents / skills

When a recurring decision class needs a steward, add a new agent. Examples that may emerge:
- `data-lead` — if cohort benchmarks / privacy / k-anonymity becomes its own discipline.
- `partner-lead` — once build-platform partnerships become real (Q3 Y1).
- `support-lead` — once ticket volume requires triage standards.

Follow the existing agent format (frontmatter + role + invocation rules + output format). Always specify what the agent says NO to fast — that's where the value compounds.

## Updating an agent

Treat agent prompts as **production code**. Any change to an agent's behavior:
1. Run `/critical-decision` (it's the operating manual for the team).
2. Record an ADR.
3. Get @ceo + @cto sign-off.
4. Update.

Don't "tweak the CEO prompt" without a paper trail.
