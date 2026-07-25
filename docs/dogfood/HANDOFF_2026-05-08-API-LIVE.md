# Handoff — apps/api is live in production (2026-05-08)

> Replaces the in-flight "why is /health broken" thread. Branch: `claude/solopreneur-launch-platform-PcSNn`.
>
> **Read this once. Don't re-investigate any item under "Fixed — do not re-debug". The git log is a red herring on its own; the matrix below is the actual ground truth.**

---

## Operating mode for the next agent — auto-pilot

You run on Claude sandbox. You **do not have**:
- Access to the founder's `.env` (no `VERCEL_TOKEN`, no `VERCEL_BYPASS_SECRET`, no `DATABASE_URL`).
- The Vercel CLI bound to a logged-in account, so `npx vercel ls`, `vercel logs`, `vercel env ls`, `vercel curl` will all fail. Don't run them and don't try to work around the absence — that path eats cycles.
- Local secrets to run `apps/api`/`apps/web` against real Neon. Local builds and type-checks still work; runtime tests do not.

You **do have**:
- The repo, full edit access on the working branch, the ability to push.
- Public network egress for HTTP curls.
- The `@ceo`, `@cto`, `@growth-lead`, `@safety-lead`, `@architect`, `@implementer`, `@reviewer`, `@validator`, `@debugger`, `@learner` agents.
- Skills: `/critical-decision`, `/feature-gate`, `/dogfood-launch`, `/find-domain`, `/learn`, `/probe`, `/loop`, `/schedule`, plus the standard editing/test skills.

How you work:

1. **Default to forward motion.** When a task is well-specified (a ticket, a clearly-scoped fix, a doc edit), implement → review → validate → merge → move on. Do not pause to chat. Do not summarise after every step. Match the project's "ship over discuss" cadence.
2. **Test live by merging.** You can't curl `dot-api` directly (Vercel SSO + no bypass token). You **can** push a branch, wait for Vercel to redeploy `dot` (apps/web), and curl the public surfaces:
   - `https://launchwings.com/` — apps/web HTML.
   - `https://launchwings.com/api/waitlist` — Next.js route handler.
   - `https://launchwings.com/trpc/<public-procedure>` — same-origin proxy that `apps/web/next.config.ts` forwards to `dot-api`. Public procedures (`directory.getDirectoryCatalog`, `health.ping`) work without a Clerk session.
   - For anything that requires Clerk auth or direct `dot-api` curl, ask the founder to run the check and paste back the result. Do not invent results.
3. **Use team agents for critical decisions, not for routine implementation.** A critical decision is anything matching:
   - **Scope/strategy** ("should we add X to v1?", "should we drop Y?", anything that changes the wedge or ICP) → `/critical-decision` (it spawns `@ceo`, `@cto`, parallel reviewers and writes an ADR), or `@ceo` directly for a pure positioning call.
   - **Architecture/build-vs-buy/new dependency** (adding a service, picking a vendor, anything in `docs/architecture/STACK.md`) → `@cto` or `/critical-decision`.
   - **Trust & safety / abuse / outbound content / third-party API call surface** → `@safety-lead`. They have veto on Class C pre-mortem trip-wires.
   - **Acquisition, pricing, ICP messaging, marketing-site copy** → `@growth-lead` (and `/copy-review` before any customer-facing copy lands).
   - Anything that costs more than ~½ day of engineering, or any change that could displace a planned MVP item → `/feature-gate` first as a quick scope check.

   For all other work — bug fixes, well-scoped tickets, refactors that are obviously in-scope — go straight to `@implementer` → `@reviewer` → `@validator`. No subagent council needed. Don't over-route.
4. **Stop and wait for the founder only when one of these is true:**
   - You hit a hard external dependency (need a Vercel env var set, need a secret rotated, need DB migration approval, need a third-party account provisioned).
   - You've burned three cycles on the same class of error (CLAUDE.md three-strikes rule).
   - You're about to take a destructive or irreversible action (force-push, schema change, prod data write, sending email/social on someone's behalf).
   - A team agent (especially `@safety-lead`) returns a veto.
   Otherwise: keep going. The founder is asynchronous; do not block on them for non-blocking calls.
5. **Carry decisions forward.** When a non-trivial call is made, write an ADR under `docs/decisions/<NNNN>-<slug>.md` so the *next* agent doesn't relitigate. Reference the ADR from the ticket file and from your commit message.

---

## Current ground truth (verified 2026-05-08)

`apps/api` is deployed on the **`dot-api` Vercel project** and responding 200 on production. The smoke matrix below was run by the previous (founder-context) agent; you cannot re-run it directly without the bypass token. Trust it.

| Endpoint | Result |
|---|---|
| `GET /health` | 200, `nodeEnv: production` |
| `GET /ready` | 200 |
| `GET /trpc/health.ping` | 200 |
| `GET /trpc/directory.getDirectoryCatalog` | 200, 31 directories returned |

Local end-to-end against real Neon (founder shell) also confirmed:

| Endpoint | Result |
|---|---|
| `tenant.tenantCheck` (X-Test-* headers) | 200, `rlsApplied: true` |
| `insight.listBriefs` | 200, `[]` |
| `social.listDrafts` | 200, `[]` |

`apps/web` (the **`dot`** Vercel project) had been failing to build after commit `5298344`; the one-line fix in `apps/web/vercel.json` shipped in `d0f8727`. As of this handoff Vercel is rebuilding. **Your first action** is to verify that `https://launchwings.com/` returns 200 and renders. If it doesn't, read `apps/web` build output via the Vercel dashboard (ask the founder for the link or paste of the build log).

---

## Fixed today — do not re-debug

If any of these symptoms reappear, look for a regression of the named commit before re-investigating. Each one cost a real cycle to diagnose; do not redo the work.

1. **`Cannot find module '/var/task/apps/api/src/env'` on boot** — fixed in `4e70a1e`. Static relative imports inside `apps/api/src/*.ts` need explicit `.js` extensions because Vercel's Node runtime is strict ESM. The dynamic-import case was already fixed in `61322b2`; this commit closes the static side.

2. **`syntax error at or near "$1"` on every tenant-scoped tRPC procedure** — fixed in `653fbfd`. Postgres `SET LOCAL` does not accept bind parameters. Use `SELECT set_config('app.tenant_id', $1, true)` instead. Single source of truth: `packages/db/src/tenant-scope.ts`.

3. **`@launchwings/api env: CLERK_SECRET_KEY is required in production`** — was a missing env var on the **`dot-api`** project, not a code bug. Founder added `CLERK_SECRET_KEY` + `CLERK_PUBLISHABLE_KEY` mid-session. The trap: the **`dot`** (web) project has had Clerk vars for months; **`dot-api`** is a separate Vercel project with its own env scope. Don't conflate them. If you need a new var on `dot-api`, ask the founder to set it; you cannot.

4. **`this.raw.headers.get is not a function` + 60s lambda hang** — fixed in `0dca0bb`. `hono/vercel`'s `handle` is the Edge-runtime adapter and expects a Web `Request`. We pin `runtime: "nodejs"` (drizzle-pg + `node:crypto` rule out Edge), so Vercel passes a Node `IncomingMessage`. Use `getRequestListener(app.fetch)` from `@hono/node-server` — that's the canonical Node ↔ Hono bridge.

5. **`apps/web` build "module not found @launchwings/db" on Vercel** — fixed in `d0f8727`. After `5298344` the workspace packages export `./dist/*.js`, so the web build needs turbo to run `dependsOn: ^build` first. `apps/web/vercel.json` was still calling `pnpm --filter @launchwings/web build` directly; switched to `pnpm turbo run build --filter=@launchwings/web` to mirror `apps/api/vercel.json`.

---

## Vercel project map (memorise this)

There are **two** Vercel projects in `akash-pathaks-projects`:

| Vercel project | Repo path | Purpose | Notes |
|---|---|---|---|
| `dot` | `apps/web` | Marketing + waitlist + future product UI | Aliased to `launchwings.com`, `www.launchwings.com` — public, you can curl it |
| `dot-api` | `apps/api` | Hono API on Vercel Functions | Aliased to `dot-api.vercel.app` — gated by Vercel SSO; you cannot curl it directly without the bypass token, only via the `apps/web` proxy |

Env vars are scoped per-project. Adding a secret to `dot` does **not** make it available to `dot-api`. The minimum runtime env on `dot-api` is now: `DATABASE_URL`, `DATABASE_URL_POOLED`, `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, plus the optional ones (`CLERK_JWT_KEY`, `OPENAI_API_KEY`, `TRIGGER_*`, `RESEND_*`).

**Do not** try to disable SSO on `dot-api` or to embed the bypass token in the repo. Both require the founder. If you genuinely need to verify a `dot-api` change, push the branch, then ask the founder to run the cookie-bypass curl flow and paste back the result.

---

## Local dev — founder-only

The next agent (you) cannot run `apps/api` against real Neon — that needs `.env`. You **can** still run:

- `pnpm install` and `pnpm turbo run build` (workspace packages compile cleanly with no secrets).
- `pnpm --filter @launchwings/api type-check` and `pnpm --filter @launchwings/web type-check`.
- `pnpm --filter @launchwings/web build` (Next.js build is happy without runtime secrets; missing-env warnings are expected).

Anything that needs a live database or Clerk verification has to go through Vercel — write the code, push, and have the founder confirm.

---

## What's next — Sprint 2 starts now

The infra closeout is done. Per `docs/tickets/ROADMAP.md`, the next phase is **Sprint 2 — Onboarding + Discovery + LRS Stage 1** (`docs/tickets/SPRINT_02.md`). The first three tickets are independent enough to fan out:

- **`ONB-01` — URL importer (Firecrawl + screenshot).** POST `/products/import`, persist into `products.metadata`. Build-platform auto-detect via subdomain regex + `<meta name=generator>`. 4d.
- **`ONB-02` — PDF/MD brief upload + parse.** ≤10MB PDF, text via `pdf-parse`, attachments to R2. 2d.
- **`ONB-04` — Discovery Agent (Sonnet).** Input from ONB-01/02/03, output schema-validated Launch Brief in <30s, golden eval set, $0.50 cost cap. Depends on ONB-01.

**`ONB-03` (GitHub repo connect)** is parallelizable but requires GitHub OAuth; queue it after ONB-01 lands so the connector spec is concrete.

In parallel, the dogfood loop wants `DOG-09` to run the LRS Stage 1 audit on `launchwings.com` itself — every failure becomes a Stage-1 evaluator spec for `LRC-02`. See `docs/dogfood/HANDOFF_NEXT_PHASE.md` for that thread; do not re-open the founder-ops items, those are closed.

### Recommended order of work (auto-pilot — start at the top, do not stop)

1. **Verify the apps/web Vercel deploy from `d0f8727`.** Curl `https://launchwings.com/` — expect 200 with rendered HTML. Curl `https://launchwings.com/trpc/health.ping` — expect 200 JSON. If either fails, ask the founder for the build log; do not invent a fix from a guessed error.
2. **Confirm the same-origin tRPC proxy routes web → dot-api end-to-end** by calling `https://launchwings.com/trpc/directory.getDirectoryCatalog`. A 200 with the directory list proves the wire is connected. If this is the first procedure you ship code on, write a tiny test page or a `/api/healthz` route in `apps/web` that echoes the upstream response.
3. **Pick up `ONB-01`.** Start a fresh ticket file at `docs/tickets/onb-01-url-importer.md` mirroring `SPRINT_02.md`'s acceptance criteria. Run `/feature-gate` on it before starting if you're at all unsure it belongs in MVP. Implement → `@reviewer` → `@validator`. Merge.
4. **Cherry-pick onto the default branch** (`claude/solopreneur-launch-platform-PcSNn` is the default per `CLAUDE.md`) **only with founder approval**. Otherwise stack changes on the per-task branch and let the founder pull.
5. Continue to `ONB-02` and `ONB-04` in the same loop. Don't wait between tickets unless a critical decision surfaces.

### Things deliberately not yet done — don't do them yet

- **Cron jobs / Trigger.dev tasks against agents.** `TRIGGER_SECRET_KEY` is set on `dot-api` but no task is currently invoked from a route. Wire it when `ONB-04` lands, not before — premature wiring obscures debugging.
- **Sentry / OTel exporter.** `SENTRY_DSN` and `OTEL_EXPORTER_OTLP_ENDPOINT` are intentionally empty so `initSentry`/`initOtel` no-op. Production observability is a Phase 0 stretch goal (`SETUP-05`); leave it off until the team has a SLO to defend.
- **`GIT_SHA` env var on `dot-api`.** `/health` currently returns `gitSha: "dev"`. Not blocking; trivially fixed by setting `GIT_SHA = $VERCEL_GIT_COMMIT_SHA` on the project. File a follow-up ticket if it bothers you; don't build a workaround.
- **Disabling Vercel SSO on `dot-api`.** Keep it on; the API is not public yet.
- **Database schema changes.** Any migration touches founder-managed Neon. Stage the migration file in `packages/db/migrations/` but ask before applying.

---

## Repo conventions worth knowing before editing

- **Git author MUST be `Akash Pathak <akash@lyric.tech>`** for commits to land on Vercel. The email is the one Vercel's git-author rule recognises; the display name is the founder's. Set with `git config user.email akash@lyric.tech && git config user.name "Akash Pathak"`. If a fresh clone uses `noreply@anthropic.com`, Vercel's deployment-protection rule rejects the deploy. (`CLAUDE.md` is the source of truth and has been updated to match.)
- **All `apps/api/src/**` relative imports use `.js` extensions** (Node ESM strict). TS `moduleResolution: bundler` resolves them back to source. Don't strip extensions thinking it's cleaner — it isn't, it's broken.
- **All `@launchwings/*` package imports go through the package name**, never relative paths into another package. Subpath exports are listed in each package's `package.json` `exports` field.
- **Tenant-scoped DB writes always go through `withTenant(db, tenantId, async tx => ...)`**. RLS depends on the per-transaction `app.tenant_id` setting; bypassing the wrapper gets you cross-tenant reads.
- **Workspace packages compile to `dist/`** before any app build (commits `5298344` + `b9458b5`). Always go through turbo (`pnpm turbo run build --filter=...`), never `pnpm --filter ... build` directly, when an app depends on a workspace package.

---

## File index for next agent

- Current state — this file.
- Roadmap — `docs/tickets/ROADMAP.md`.
- Active sprint — `docs/tickets/SPRINT_02.md`.
- Per-feature spec — `docs/product/PRD.md`.
- Vision (do not redefine ICP/wedge) — `docs/product/VISION.md` (if missing, ask before inventing).
- Pre-mortem trip-wires (Class A/B/C failures that gate `@safety-lead` veto) — `docs/product/PRE_MORTEM.md`.
- Dogfood loop — `docs/dogfood/HANDOFF_NEXT_PHASE.md` + `docs/dogfood/learnings.md`.
- Trust & safety bar — `docs/architecture/TRUST_SAFETY.md`.
- Stack pins (do not add a new self-hosted service without `@cto` ADR) — `docs/architecture/STACK.md`.
- Decisions log — `docs/decisions/000*.md` (read 0002, 0003, 0004 for the deploy/internal-tooling/domain calls).
