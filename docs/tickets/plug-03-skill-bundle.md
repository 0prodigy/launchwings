# PLUG-03 — Skill bundle (P3)

*Status: P0. Sequencing: Phase 4 (Wk 14+).*

## Why this exists

`docs/product/PRD.md` F4 / P3. A `SKILL.md`-compatible bundle that drops into Claude Code, OpenClaw, Pickaxe, or any plugin host that follows the Claude plugin spec. `/launch-today` invoked from inside any Claude session returns the morning plan inline. Composes with — does not replace — the host's other plugins.

## What it is

A repository at `github.com/launchwings/skill-bundle` containing:

- `SKILL.md` — top-level skill manifest.
- `commands/launch-today.md` — the `/launch-today` subcommand, calling PROD-01.
- `commands/launch-triage.md` — the `/launch-triage` subcommand, calling PROD-02.
- `commands/launch-why.md` — `/launch-why <action_id>` for ranker reasoning.
- `commands/launch-approve.md` — `/launch-approve <action_id>` (routes through SAFE-01).
- `setup.md` — bearer-token bootstrap instructions.

Each command is a thin wrapper that fetches from `mcp.launchwings.com` (or the user's self-hosted MCP, post Phase 4+). The skill itself contains no business logic — the moat lives in the hosted rails.

## Acceptance criteria

1. Skill installable via `claude plugin install launchwings/skill-bundle`.
2. Skill installable via `openclaw skill add launchwings/skill-bundle` (when OpenClaw ships its skill-add API).
3. Each command round-trips against the hosted MCP server in ≤ 2s end-to-end.
4. Skill manifest declares the minimal set of permissions (no filesystem access, network access only to `*.launchwings.com`).
5. README explains the bearer-token bootstrap in ≤ 5 lines.

## Tech

- Plain Markdown / YAML per the Claude plugin spec.
- Each command calls the corresponding `launchwings.*` MCP tool from PLUG-02.

## Distribution

- Open-sourced under MIT at `github.com/launchwings/skill-bundle`.
- Listed at `claudemarketplaces.com` and the Anthropic plugin directory.
- Linked from the LaunchWings dashboard "Settings → Plug-points → Claude/OpenClaw/Pickaxe".

## Out of scope

- A self-hosted MCP variant (post Phase 4+).
- Reimplementing F1/F2/F3 logic locally (the skill is a thin client by design — the rails are the moat).

## Dependencies

- PLUG-02 MCP server live.
- Phase 4 trigger (Phase 3 kill-criterion cleared).

## Tests + observability

- CI in the skill-bundle repo asserts the manifest validates against the Claude plugin spec.
- Integration: `/launch-today` from inside a Claude Code session returns the expected payload.

## Owner hand-off

When green, the marketing site adds "Use from inside Claude Code / OpenClaw / Pickaxe" to the landing copy.
