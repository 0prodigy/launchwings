# PLUG-02 — MCP server (P2)

*Status: P0. Sequencing: Phase 4 (Wk 14+).*

## Why this exists

`docs/product/PRD.md` F4 / P2. Any MCP-capable canvas (Cursor, Lovable, Bolt, Claude Desktop, Continue, Windsurf) can summon LaunchWings from inside its own flow. The host renders the response in its native UI. This is the wedge into the build canvases — instead of dragging users out to our dashboard, we run inside theirs.

## What it is

A hosted MCP server at `mcp.launchwings.com` exposing the following tools, each authenticated via a per-tenant bearer token:

- `launchwings.today` — returns today's three ranked actions (calls PROD-01).
- `launchwings.triage` — returns the current F2 surfaced conversation (calls PROD-02).
- `launchwings.cohort.benchmark({ channel, slice, weekOffset })` — returns the cohort answer (calls PROD-03).
- `launchwings.draft.post({ channel, copy, scheduled_time })` — drafts an outbound through SAFE-01 monitor model (no dispatch).
- `launchwings.approve({ action_id })` — dispatches an action through SAFE-01.
- `launchwings.audit.timeline({ launch_id })` — returns the audit chain for a launch.

## Acceptance criteria

1. MCP server passes the spec compliance test (tool schemas, capability negotiation, error handling per the MCP specification).
2. Cursor (with the LaunchWings plugin installed) can invoke each tool from inside a chat and the response renders inline.
3. Per-tenant token issued in dashboard "Settings → MCP" (one-click revoke + rotate).
4. Rate-limited per tenant (default 1000 tool calls / day; raised on request).
5. All `launchwings.approve` invocations route through SAFE-01 identically to web / CLI.

## Tech

- `apps/mcp/src/index.ts` — Hono server implementing the MCP transport.
- Reuses the same tRPC procs as the web app and CLI.
- Bearer-token authentication backed by `mcp_tenant_token` Drizzle table.
- Deployed as a separate Vercel project; subdomain `mcp.launchwings.com`.

## Distribution

- Listed in the Cursor Marketplace (post-validation, conditional on Phase 3 kill-criterion clearance).
- Listed in Anthropic Cowork plugin directory (same condition).
- Available as a manual config snippet for any MCP-capable host.

## Out of scope

- A bundled UI inside the MCP host (the host renders).
- Streaming responses (request/response only in v1).

## Dependencies

- PROD-01, PROD-02, PROD-03, SAFE-01 ship green.
- Phase 3 Day-90 kill-criterion adjudicated favorably.

## Tests + observability

- MCP spec compliance test suite passes.
- Integration: end-to-end Cursor → `launchwings.today` → response rendered.
- Per-tenant rate-limit enforcement test.
- Langfuse trace on every tool invocation.

## Owner hand-off

When green, the marketing site adds "Use from inside Cursor / Lovable / Claude Desktop" to the landing copy, gated by `@copy-review`.
