# PLUG-01 — `lw` CLI (P1)

*Status: P0. Sequencing: Phase 2 (Wk 7–10).*

## Why this exists

`docs/product/PRD.md` F4 / P1. The CLI is the surface that lands LaunchWings inside the developer's existing terminal — the same place `git` and `pnpm` live. `lw today` is the morning ritual the way `git pull` is.

## What it is

A single binary distributable via npm, Homebrew (post-validation), or `curl | sh`. Subcommands:

- `lw login` — OAuth flow opens a browser, returns a stored token in `~/.config/launchwings/`.
- `lw today` — prints today's three actions (PROD-01) in a terminal-friendly format.
- `lw triage` — prints the F2 surfaced conversation (PROD-02).
- `lw why <action_id>` — prints the ranker's reasoning + cohort evidence for the action.
- `lw approve <action_id>` — dispatches through SAFE-01.
- `lw decline <action_id> [--reason]` — sends decline feedback to the ranker.

Output is plain ANSI text with optional `--json` flag for piping into other tools (e.g. `lw today --json | jq .actions`).

## Acceptance criteria

1. `npm i -g launchwings` installs `lw` on macOS, Linux, Windows.
2. `lw login` completes OAuth round-trip and stores the token securely in the OS keychain on macOS; `~/.config/launchwings/` with 0600 perms elsewhere.
3. `lw today` p95 latency ≤ 1.5s from invocation to first action printed (server-side cached).
4. All actionable commands have a matching `--json` output for composability.
5. Binary size ≤ 8MB; cold start ≤ 100ms.

## Tech

- Built in Node with `tsx` bundle → `pkg`-style single-binary output, OR a thin Bun binary.
- Wraps the same tRPC procs PROD-01 / PROD-02 / SAFE-01 expose to the web app.
- Token storage via `keytar` on macOS, OS-equivalent elsewhere.
- Distributed as `@launchwings/cli` on npm.

## Out of scope

- A REPL / interactive mode (one-shot subcommands only in v1).
- A `lw watch` mode that streams events (post-validation).
- Editor integrations (those compose through PLUG-02 MCP server).

## Dependencies

- PROD-01, PROD-02, SAFE-01 — the calls the CLI wraps.
- OAuth flow shared with the web app.

## Tests + observability

- Unit: each subcommand round-trips against a mock server.
- Integration: end-to-end on macOS, Linux, Windows runners in CI.
- Anonymous usage telemetry (opt-out) — invocation count per subcommand for ranker tuning.

## Owner hand-off

When green, hand to PLUG-02 (MCP server) and PLUG-03 (skill bundle) for the broader plug-point surface.
