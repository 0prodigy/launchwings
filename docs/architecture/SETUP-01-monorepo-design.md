# SETUP-01 — Monorepo Design

> Design doc for `SETUP-01 — Repo + monorepo + Next.js 15 + Hono + tRPC` (`docs/tickets/SPRINT_01.md`).
> Authored: 2026-05-08 by `architect` agent. Persisted by orchestrator on branch `architecture/setup-01-design`.
> Status: review-ready. Next step is PR1 (workspace hoist only) by `implementer` once the founder ratifies the pushbacks in §13.

The wedge is the **Launch Readiness Checklist Audit Agent** (`LRC-02`); every architectural choice in this doc is defended against that path. Cited inputs: `docs/product/VISION.md`, `docs/product/PRD.md`, `docs/tickets/SPRINT_01.md`, `docs/tickets/SPRINT_02.md`, `docs/decisions/0002-no-github-deploy-in-v1.md`, `docs/dogfood/learnings.md` (entries #2, #6, #9, #12).

---

## 1. Workspace shape (final tree after SETUP-01)

```
dot/
├─ apps/
│  ├─ web/                 # Next 15 marketing + app shell (Vercel)
│  └─ api/                 # Hono + tRPC server (Fly.io, see §4)
├─ packages/
│  ├─ db/                  # Drizzle schema, migrations, client factory
│  └─ trpc/                # tRPC routers + AppRouter type (consumed by web + api)
├─ tooling/
│  ├─ tsconfig/            # base.json, next.json, node.json
│  └─ eslint-config/       # shared flat config
├─ docs/                   # unchanged
├─ .github/workflows/      # ci.yml, eval.yml (later)
├─ pnpm-workspace.yaml
├─ package.json            # root: scripts, devDeps only
├─ turbo.json              # pipeline (build, lint, type-check, test)
├─ .npmrc                  # node-linker=isolated, strict-peer-dependencies=true
└─ tsconfig.base.json
```

**Pushback on SPRINT_01 ticket package list.** The ticket asks for `packages/db`, `packages/agents`, `packages/connectors`, `packages/eval` on day one. Three of those have **zero callers until Sprint 2/3** (`LRC-01` needs `agents`/`eval`; `SETUP-11` needs `connectors`). Carrying empty packages costs CI time, type-graph time, and review attention. **Recommend deferring `packages/agents`, `packages/connectors`, `packages/eval` to the PR that introduces their first consumer.** Ship only `packages/db` + `packages/trpc` in SETUP-01. (Net: 4 packages → 2; revisit at SETUP-04, SETUP-11, SETUP-12 respectively.)

`packages/trpc` (not in ticket) is added because tRPC routers must be importable by both `apps/web` (client) and `apps/api` (server). If they live in `apps/api`, the web app type-imports across an app boundary and Vercel's `next build` will choke on it.

Dependency graph: `apps/web` → `packages/trpc` (types only) + `packages/db` (server actions). `apps/api` → `packages/trpc` + `packages/db`. `packages/trpc` → `packages/db` (for inferred types).

## 2. Workspace tool — pnpm

Confirm pnpm. Two reasons: (a) Vercel and Fly both have first-class pnpm caching; bun workspaces still hit edge cases with Next 15's monorepo file tracing; (b) `node-linker=isolated` (pnpm default) catches phantom-dep bugs that npm/yarn classic hide — exactly the bug class that bites a young monorepo.

## 3. Hoisting `apps/web`

Literal moves/edits (single PR, see §12 PR1):

1. **Create at root**: `pnpm-workspace.yaml` (`packages: [apps/*, packages/*, tooling/*]`), root `package.json` (`private: true`, `"packageManager": "pnpm@9.x"`, devDeps: turbo, prettier, typescript), `turbo.json`, `tsconfig.base.json`, `.npmrc`.
2. **`apps/web/package.json`**: rename `"name": "launchwings-web"` → `"@launchwings/web"`. Confirm `"private": true`. Engines stay `>=20.x` (will bump to `>=22` in SETUP-04 when the api joins).
3. **`apps/web/tsconfig.json`**: `"extends": "../../tooling/tsconfig/next.json"`. Keep `paths: { "@/*": ["./*"] }` local — do NOT lift path aliases to base; cross-app aliasing is a footgun.
4. **Tailwind**: **leave `tailwind.config.ts` and `postcss.config.mjs` co-located in `apps/web`.** Do not extract. Tailwind v3 + pnpm isolated linker has known PostCSS resolution issues if config moves; we just downshifted v4→v3 (`eb1fbe7`), no need to retest plugin paths.
5. **Vercel project settings**: change "Root Directory" to `apps/web`, set "Install Command" to `pnpm install --frozen-lockfile` at the **repo root** (not in `apps/web`). Build command stays `pnpm --filter @launchwings/web build`.
6. **Lockfile**: replace any `package-lock.json` at root with single `pnpm-lock.yaml`. (Note: an `apps/web/pnpm-lock.yaml` exists from the OG fix — that gets superseded by the root lockfile in PR1 and removed.)

**Day-one CI breakage to anticipate:**
- Vercel cache invalidation: first deploy will be cold and slow. Expected.
- ESLint flat config: `eslint-config-next` 15.x doesn't yet ship a flat config in all minor versions — keep legacy `.eslintrc` in `apps/web` until next-eslint flat lands cleanly. Don't fight this in SETUP-01.
- `next.config.ts` `transpilePackages: ["@launchwings/trpc", "@launchwings/db"]` will be needed the moment web imports either. Add when web first consumes them, not before.

## 4. API runtime — Hono on Node 22, deployed to Fly.io

Confirm Hono on Node 22. **Pushback on Vercel Functions for the api**: `LRC-02` needs a 60s parallel evaluator runner that does `fetch` to user URLs (Stage 1 evaluators) plus Lighthouse subprocess work. Vercel Functions cap at 60s on Pro and have cold-start tax + no persistent outbound IP — the Cloudflare 1016 incident (`learnings.md` #9, commit `1b6a00b`) shows we already lost time to Vercel proxy/IP behavior. Fly.io gives us:

- Static egress IPs (needed for connectors that allowlist by IP).
- Long-running processes for Lighthouse-CI worker and Browserbase orchestration.
- Same region as Neon primary (Fly `iad` ↔ Neon `us-east-2`).

Keeps ADR-0002 boundary: we run our own backend, not user infra. Deploy via `fly deploy` from `apps/api/Dockerfile`. Cloudflare Workers is rejected because (a) Node-only Drizzle plugins and Lighthouse are non-starters there, (b) we've already paid the Cloudflare-orange-cloud tax once.

## 5. DB & ORM — Neon + Drizzle, **two clients**

Confirm Neon + Drizzle. Connection strategy:

- **`apps/web` (Vercel Functions / RSC)**: `@neondatabase/serverless` driver over HTTP. Stateless, no pooling worry. Used only for short reads in RSC and form actions.
- **`apps/api` (Fly.io, long-lived Node)**: `pg` Pool + Neon **PgBouncer** pooler endpoint (`...-pooler.neon.tech`). Transaction-mode pooling. Drizzle's `node-postgres` driver.
- Two clients exported from `packages/db`: `dbHttp` and `dbPool`. Caller imports the right one.

**RLS strategy**: every multi-tenant table gets `tenant_id uuid NOT NULL` + a `USING (tenant_id = current_setting('app.tenant_id')::uuid)` policy. Hono middleware sets `SET LOCAL app.tenant_id = ...` per-request inside a transaction. This is SETUP-02/03's job; SETUP-01 only ships the schema scaffold and a roundtrip test.

Migrations: `drizzle-kit generate` produces forward SQL; **every migration file gets a sibling `*.down.sql` written by hand**. CI test verifies `up→down→up` is idempotent on a Neon branch.

## 6. Auth — Clerk, tenant scoping middleware

Confirm Clerk. Middleware sketch (Hono, pseudo-code):

```ts
app.use('*', async (c, next) => {
  const { userId, orgId } = await clerkAuth(c.req.raw)
  if (!userId) return c.json({ error: 'unauth' }, 401)
  const tenantId = orgId ?? await resolvePersonalTenant(userId)
  c.set('tenantId', tenantId)
  await db.execute(sql`SET LOCAL app.tenant_id = ${tenantId}`)
  await next()
})
```

Cross-tenant test (SETUP-03 acceptance): seed two tenants, assert User-A's session reading `products` where `tenant_id = B` returns 0 rows by RLS, not by application filter.

## 7. Agent runner — Trigger.dev, no pushback

Pushback considered and rejected. Discovery Agent is short-lived (~30s) and inline-Vercel would work for it alone — but **`LRC-01` is the wedge** and its acceptance criteria are 76 evaluators in parallel with retry, evidence persistence, and bulk re-run via cron. That's a fan-out durability profile. Inline functions would force us to rewrite at SETUP-04 anyway. Pay the Trigger.dev setup cost once in SETUP-04 and use it for both.

## 8. Audit harness (`LRC-01`) — build internally

Build on Trigger.dev. **2–3 dev-days** to write the `Evaluator` interface + parallel runner + persistence. Reasons OSS harnesses lose: Promptfoo and Inspect-AI are evaluator runners for **LLM eval suites** (golden-set scoring), not for production-time evaluators that fetch URLs and persist evidence with `fix_action` for the founder UI. Wrong shape. Reuse `packages/eval` (Sprint 1 ticket SETUP-12) for **golden-set scoring of the agents themselves** — separate concern. Two harnesses, one for product (`LRC-01`), one for CI (`SETUP-12`), is correct.

## 9. HTML + Lighthouse stack pin

| Concern | Pick | Why (≤ 2 lines) |
|---|---|---|
| HTTP fetch | **Firecrawl** for crawl, raw `fetch` for single-URL probes | Firecrawl already in ONB-01 spec; reusing it for Stage 1 page-discovery avoids a second crawler. Single-page evaluators (SSL, headers) use raw fetch from `apps/api` — no JS render needed. |
| HTML parse | **cheerio** | DOM-heuristic evaluators (CTA, pricing detector, OG meta) are jQuery-shaped. unified/rehype is overkill; Playwright is too heavy when we already have Browserbase for screenshots. |
| Lighthouse | **PageSpeed Insights API** for v1, swap to Browserbase + Lighthouse-as-Browser when we hit quota | PSI is free, 25k/day, runs from Google's infra (matches what users actually see); zero ops. `unlighthouse` worker and self-hosted Lighthouse-CI both lose because we're not building infra (ADR-0002 spirit). |

Pin these in a follow-up `docs/architecture/STACK.md` so the 18 Stage 1 evaluators don't re-litigate per-ticket.

## 10. Vercel deploy churn

Production-pin to `main`; preview-only for branches; docs-only commits skip build entirely.

`vercel.json` at repo root:

```json
{
  "git": { "deploymentEnabled": { "main": true } },
  "ignoreCommand": "bash -lc 'git diff --quiet HEAD^ HEAD -- apps/web packages/trpc packages/db && exit 0 || exit 1'"
}
```

Combine with Vercel project setting **"Production Branch = `main`"** and **"Auto-deploy on push" = off for production** if available; otherwise rely on `git.deploymentEnabled`. Feature branches preview-deploy automatically. Manual production promote via `vercel promote` from CI on a merged PR with a `release:` label, or just `git push origin main` with branch protection requiring review.

## 11. WEB-001 (build-time link-availability check, `learnings.md` #12)

**Bolt-on now, ~1 hour.** Use `lychee` in a GitHub Action that runs on PR + nightly cron against the deployed preview URL. Don't write a Next plugin (build-time link checks have false-negatives on dynamic routes). `lychee --offline` for repo-internal markdown links, `lychee <preview-url>` for live links. Output to PR comment. This would have caught the dead `/og-default.png` and `/favicon.ico` references at PR time.

## 12. PR sequencing for `SETUP-01..07`

| PR | Scope | Size | Checkpoint |
|---|---|---|---|
| **PR1 (`SETUP-01a`)** | pnpm workspace + root config + rename `apps/web` package + tooling configs. No new apps. | M | Vercel preview still green; `pnpm dev` runs web on :3000. |
| **PR2 (`SETUP-01b`)** | `apps/api` skeleton (Hono + tRPC hello route) + `packages/trpc` + Fly.io project + `pnpm dev` parallelized via turbo. | M | Local: web calls api on :3001; preview: api deploys to a Fly app. |
| **PR3 (`SETUP-02`)** | `packages/db` + Drizzle schema + Neon dev branch + RLS + reversible migrations. | L | `pnpm db:migrate` round-trips; cross-tenant test green. |
| **PR4 (`SETUP-03`)** | Clerk + tenant middleware + first protected tRPC procedure. | M | Real user signs in, hits protected route, RLS denies cross-tenant. |
| **PR5 (`SETUP-04`)** | Trigger.dev v3 project + `helloAgent` + `dailyMorningBrief` cron. Introduces `packages/agents`. | M | Trigger dashboard shows successful run; row in `agent_runs`. |
| **PR6 (`SETUP-05`)** | `packages/agents/llm.ts` wrapper + cassette tests. | M | Unit suite green; cost logged on `helloAgent`. |
| **PR7 (`SETUP-06`)** | OTel + Sentry + Axiom wiring. | M | One trace visible end-to-end web → api → LLM. |
| **PR8 (`SETUP-07`)** | Neon branch-per-PR GH Action + Trigger preview env + Playwright smoke on preview. | M | Open dummy PR, see DB branch + preview URL + smoke pass. |

Natural review checkpoints: PR1 (workspace shape locked), PR3 (DB contract locked), PR4 (auth contract locked), PR8 (preview-deploy story locked).

## 13. Risk register (PR-time detection)

| # | Risk | Detect at PR time |
|---|---|---|
| **R1** | Tailwind v3 PostCSS path resolution breaks under pnpm `node-linker=isolated` after hoist. | PR1 preview deploy: visual diff on `/` — if styles missing, revert hoist of `tailwind.config.ts`. Mitigation: keep config co-located. |
| **R2** | Vercel build picks up wrong root after monorepo hoist (we already lost time on the orange-cloud Cloudflare/Vercel learning). | PR1: confirm preview URL serves built output, not 404. Add a `__build_meta__.json` route in PR1 with commit SHA; validate in smoke. |
| **R3** | Neon serverless driver vs pooled `pg` driver mismatch — RLS `SET LOCAL` does nothing on HTTP driver (no transaction). | PR3: integration test that does `SET LOCAL` then asserts `current_setting('app.tenant_id')` returns the value. Will fail on HTTP driver and force `dbPool`-only for tenant-scoped writes. |
| **R4** | tRPC type imports across app boundary cause Vercel `next build` to type-check `apps/api`. | PR2: `next build` log inspection in CI — if it visits `apps/api/**.ts`, fix `transpilePackages` and `tsconfig` `references` instead of cross-app imports. |
| **R5** | Trigger.dev v3 + Fly.io egress conflict (Trigger workers run in their cloud; api on Fly). DB connection limits blow up if both pool to Neon primary. | PR5: load-test `helloAgent` × 50 parallel; watch Neon connection count. Fix: route Trigger tasks through Neon pooler endpoint, cap `pg` pool at `max=5`. |

---

## Summary of pushbacks on `SPRINT_01.md`

1. **Package count.** Defer `packages/agents`, `packages/connectors`, `packages/eval` to the PRs that first consume them (`SETUP-04`, `SETUP-11`, `SETUP-12`). Ship only `packages/db` + `packages/trpc` in SETUP-01.
2. **API hosting.** Recommend Fly.io from day one — `LRC-02` needs static egress IP, >60s budget, and Lighthouse subprocess support that Vercel Functions can't give us.
3. **Added** `packages/trpc` to the package list (not in ticket) — required so web and api don't cross-import across the app boundary.

These pushbacks are non-binding until the founder ratifies. Once ratified, update `docs/tickets/SPRINT_01.md` `SETUP-01` ticket to match.

## Headline architectural call

> Two-app monorepo on pnpm — Next 15 on Vercel for web, Hono on Fly.io for api — with tRPC types shared via a thin `packages/trpc` package, Trigger.dev for all durable agent work from day one.

## Biggest risk

**R3** — RLS `SET LOCAL app.tenant_id` is silently a no-op on Neon's HTTP serverless driver because there's no surrounding transaction. If we standardize on the HTTP driver in `apps/web` server actions and forget this, we get apparent tenant scoping that actually leaks. Detection: integration test that `SET LOCAL`s then reads `current_setting`. Mitigation: tenant-scoped writes must go through `dbPool` (PgBouncer) only.

## Recommended next step

PR1 (workspace hoist only, no new apps) by `implementer`. Lowest blast radius, locks the workspace shape before anything depends on it. `validator` should exercise the deployed preview URL after PR1 to catch R1/R2 before PR2 layers on the api.
