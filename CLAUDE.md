# CLAUDE.md — durable instructions for Claude Code sessions in this repo

These rules apply to **every** task in this repo unless explicitly overridden
in-session by the user. Bias: caution over speed on non-trivial work. Use
judgment on trivial tasks. All agents and skills in `.claude/` inherit these.

---

## Coding patterns (the 12 rules)

### Rule 1 — Think before coding
State assumptions explicitly. If uncertain, ask rather than guess. Present
multiple interpretations when ambiguity exists. Push back when a simpler
approach exists. Stop when confused — name what's unclear.

### Rule 2 — Simplicity first
Minimum code that solves the problem. Nothing speculative. No features beyond
what was asked. No abstractions for single-use code. Test: would a senior
engineer say this is overcomplicated? If yes, simplify.

### Rule 3 — Surgical changes
Touch only what you must. Clean up only your own mess. Don't "improve"
adjacent code, comments, or formatting. Don't refactor what isn't broken.
Match existing style.

### Rule 4 — Goal-driven execution
Define success criteria first. Loop until verified. Don't follow a fixed list
of steps blindly — define success and iterate. Strong success criteria let you
loop independently.

### Rule 5 — Use the model only for judgment calls
Use Claude (or any LLM) for: classification, drafting, summarization,
extraction. Do NOT use it for: routing, retries, deterministic transforms.
If code can answer, code answers.

### Rule 6 — Token budgets are not advisory
Per-task soft budget: ~4,000 tokens of generated content. Per-session soft
budget: ~30,000 tokens. If approaching budget, summarize and start fresh.
Surface the breach. Do not silently overrun.

### Rule 7 — Surface conflicts, don't average them
If two patterns contradict, pick one (more recent / more tested). Explain why.
Flag the other for cleanup. Don't blend conflicting patterns into a worse
third option.

### Rule 8 — Read before you write
Before adding code, read the exports, immediate callers, and shared utilities.
"Looks orthogonal" is dangerous. If unsure why code is structured a certain
way, ask. For build/deploy fixes specifically: research the third-party
platform (Vercel, Fly, Trigger.dev, Neon) or tooling quirk (pnpm hoisting,
turbo cache, TS module resolution) in public docs/community reports BEFORE
proposing a change. Cite the source. If you can't find a source that matches
the symptom, say so and ask.

### Rule 9 — Tests verify intent, not just behavior
Tests must encode WHY behavior matters, not just WHAT it does. A test that
can't fail when business logic changes is wrong.

### Rule 10 — Checkpoint after every significant step
Summarize what was done, what's verified, what's left. Don't continue from a
state you can't describe back. If you lose track, stop and restate.

**Three-strikes corollary** (build/deploy specifically): if the same class of
error has surfaced more than twice in a session and prior fixes didn't land,
STOP code changes. Restate what you actually know vs. assumed, ask the user
for the missing fact (dashboard state, screenshot, log), and propose ONE fix
with evidence.

### Rule 11 — Match the codebase's conventions, even if you disagree
Conformance > taste inside the codebase. If you genuinely think a convention
is harmful, surface it — don't fork silently.

### Rule 12 — Fail loud
"Completed" is wrong if anything was skipped silently. "Tests pass" is wrong
if any were skipped. Default to surfacing uncertainty, not hiding it.

**Validation corollary** (build/deploy specifically): do not push a fix until
you can cite at least one of — a docs quote, a community-issue thread that
matches the symptom, or a reproduction run locally that shows the change
works. "I think this might fix it" is not enough.

**Sandbox-limits corollary**: this environment cannot run Vercel / Fly /
Trigger CLIs, cannot read external dashboards, and cannot trigger network
calls to most third-party APIs. When a problem requires that signal, name
what you need from the user instead of inventing it.

---

## Git identity

All commits authored from this repo MUST use:

- `user.email`: `akash@lyric.tech`
- `user.name`: `Akash Pathak`

This is set in `.git/config` for this clone. If you ever start a fresh session
or new clone where the email is missing or set to `noreply@anthropic.com`,
re-set it before committing:

```bash
git config user.email akash@lyric.tech
git config user.name "Akash Pathak"
```

Why this matters: Vercel's "Git Author" deployment-protection rule rejects
deploys whose HEAD commit author email isn't a Git account it recognises.
Commits with `noreply@anthropic.com` will fail with
`The deployment was blocked because the commit email could not be matched`.

## Branch policy

- Develop on the per-task feature branch the harness assigns
  (e.g. `claude/<task>-XYZ`). The active default branch is
  `claude/solopreneur-launch-platform-PcSNn`.
- Cherry-pick from the per-task branch onto the default branch with explicit
  user permission per change. Never push directly to the default without
  authorisation.

## Cloud surface — secrets and bootstrap

See `docs/DEV_SETUP.md` for the full bootstrap order and the env-secret model
(everything is scoped under the `Production` GitHub Environment, NOT at the
repo level).

Hard rules:

- Never paste a secret into chat. Rotate via `gh secret set <NAME> --env production`.
- Workflows that need secrets MUST declare `environment: production` on the job.
- apps/api deploys to Vercel (separate project), not Fly. Fly is removed from
  the dependency graph as of arc-2 follow-up 3 (commit ee037e8).
