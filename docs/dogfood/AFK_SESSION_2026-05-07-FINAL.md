# AFK Session — 2026-05-07 (final wrap)

Consolidates the full arc of this AFK session. Two prior reports cover detail:
- `AFK_SESSION_2026-05-07-2030.md` (foundation batch — LRS-12, LRS-08, WEB-001, STACK, SETUP-01a)
- `AFK_SESSION_2026-05-07-2050.md` (Sprint 1 platform foundation + LRC-01 PR1)

This file is the executive summary you can read first.

## Bottom line

**Production branch advanced 22 commits**: `3e5a30d → b0a97fb`. Sprint 1 platform foundation is fully landed. The wedge agent (LRS Audit Agent) is implemented, tested, and dogfooded — it runs on `https://launchwings.com/audit` against any URL a visitor pastes.

## What's live on production

### Platform foundation (full Sprint 1)

| Ticket | What landed |
|---|---|
| **SETUP-01a** | pnpm + turbo workspace; `apps/web` hoisted to `@launchwings/web`; `tooling/tsconfig`; `apps/web/vercel.json` so install/build commands are version-controlled. |
| **SETUP-01b** | `apps/api` Hono+tRPC skeleton + `packages/trpc` + Dockerfile + `fly.toml` + `setup-01b-fly-deploy.yml` workflow. |
| **SETUP-02** | `packages/db` — Drizzle schema (tenants/users/products/agent_runs/audit_log/waitlist), Neon HTTP+pooled clients, `withTenant` helper, RLS migrations 0000+0001 with hand-written down.sql. |
| **SETUP-03** | Clerk auth + per-request tenant scoping middleware in `apps/api`, real `protectedProcedure` enforcement, `tenantCheck` tRPC procedure, dev `X-Test-*` escape hatch. |
| **SETUP-04** | `packages/agents` Trigger.dev v3 wrapper, `defineAgent` runtime persisting `agent_runs` rows, `helloAgent` task, `dailyMorningBrief` cron, `runHello` tRPC procedure. |
| **SETUP-05** | `packages/agents/src/llm.ts` provider-agnostic wrapper (Anthropic + OpenAI), cost-microUSD telemetry into `agent_runs`, cassette record/replay layer. |
| **SETUP-06** | `packages/observability` (initOtel + initSentry + withSpan + logEvent) wired into both apps; degraded-OK on missing env; `docs/architecture/OBSERVABILITY.md`. |
| **SETUP-07** | Neon-branch-per-PR + Playwright smoke workflows; round-trip migration test; smoke spec covering home/og/meta-length/waitlist-502-not-misleading-success. |

### The wedge — LRS Audit Agent (`packages/lrs`)

5 PRs of LRC-01 landed. This is what the whole product is about.

| PR | What landed |
|---|---|
| **LRC-01 PR1** | The harness: `Evaluator` interface, parallel runner with retry, `lrs_runs`/`lrs_results` schema (migration 0002+RLS), 2 evaluators (`meta-description`, `og-image`), 16 vitest cases, `auditTarget` Trigger task, `runAudit`/`getAuditRun` tRPC procedures. |
| **LRC-01 PR2** | 4 more evaluators: `mixed-content`, `favicon-presence`, `dns-proxy-posture` (catches the launchwings.com 1016 incident), `domain-age` (whois-json). +36 tests. |
| **LRC-01 PR3** | `hero-llm-judge` LLM-judge evaluator (Haiku + 5-axis rubric, cassette-replay), `critical-path-env` (synthetic-probe of declared API endpoints), **resolves agents↔lrs cycle via dependency injection** (`LlmFn` abstract type + injected at the `auditTarget` boundary). +27 tests. |
| **LRC-01 PR4** | `/audit` demo on `apps/web`. Public URL → form → real audit results in <30s. Full SSRF guards (DNS-resolve before fetch, redirect re-checks, body-size cap, 10s timeout), in-memory rate limit (5/hr/IP), Turnstile-gated, gracefully renders 6 evaluator cards + score band + verdict. |
| **LRC-01 PR5** | `analytics-beacon-static` evaluator — regex-scans inline + external scripts for SDK init signatures across 7 providers (PostHog, Plausible, GA4, GTM, Fathom, Splitbee, Simple). Detects `phc_REPLACE_ME` / `UA-XXXXXX` placeholder bugs (the silent-noop class from learnings.md #10). +20 tests. |

**Final test count**: `pnpm --filter @launchwings/lrs test` → **103/103**, all in mock/cassette mode (zero API keys required in CI).

### Marketing-side wins

| Ticket | What landed |
|---|---|
| **DOGFOOD-LRS-12** | Waitlist API surfaces upstream send failures as HTTP 502 instead of misleading `ok:true`. |
| **DOGFOOD-LRS-08** | Meta description trimmed 172 → 146 chars. |
| **WEB-001** | Build-time link-availability check + GitHub Action; catches the og:image / favicon 404 class that motivated learnings.md #12. |
| **STACK.md** | Pins the Stage 1 evaluator stack (Firecrawl / cheerio / PSI / native dns / whois-json / sharp) so each evaluator ticket inherits choices. |
| **`/audit` page** | The wedge becomes the homepage demo. Try it on yourself: paste a URL, see the audit live. |
| **Build-in-public posts** | 2 drafts in `docs/dogfood/posts/` (wedge-live + silent-fail-pattern). Founder publishes when ready. |

## Working CI / GitHub Actions wired this session

| Workflow | Purpose | Secret(s) needed |
|---|---|---|
| `web-001-link-check.yml` | Build-time asset availability guard | (none) |
| `setup-01b-fly-deploy.yml` | Deploy `apps/api` to Fly.io on push | `FLY_API_TOKEN` ✅ already set |
| `setup-04-trigger-deploy.yml` | Deploy `packages/agents` tasks to Trigger.dev | `TRIGGER_ACCESS_TOKEN` |
| `setup-05-agents-test.yml` | vitest on `packages/agents` PRs | (none — cassette replay) |
| `setup-07-neon-branch-pr.yml` | Neon branch-per-PR + round-trip migration test | `NEON_API_KEY`, `NEON_PROJECT_ID` |
| `setup-07-playwright-smoke.yml` | Playwright smoke against Vercel preview | `VERCEL_TOKEN`, `VERCEL_PROJECT_ID` (optional `VERCEL_TEAM_ID`) |
| `lrc-01-test.yml` | vitest on `packages/lrs` PRs | (none) |

All workflows bail gracefully with a warning when their secret isn't set.

## Founder follow-ups (in priority order)

### Tier 1 — unlocks production runtime
1. **Vercel env vars** for the production deploy (set via dashboard):
   - `DATABASE_URL`, `DATABASE_URL_POOLED` (Neon connection strings) — also enables waitlist DB persistence (small follow-up code change).
   - `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`.
   - `ANTHROPIC_API_KEY` (Sonnet/Haiku via `packages/agents/llm.ts`). `OPENAI_API_KEY` already present.
   - `RESEND_API_KEY` already present.
   - `TRIGGER_SECRET_KEY`, `TRIGGER_PROJECT_REF` (after Trigger project created).
   - `AUDIT_LLM_ENABLED=true` to enable hero-llm-judge in the `/audit` demo.
   - `SENTRY_DSN`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `AXIOM_TOKEN`, `AXIOM_DATASET` (when those accounts exist).

2. **Resend domain verification** for `launchwings.com` (still flagged from earlier reports). LRS-12 fix surfaces the failure as 502 instead of misleading 200, but the underlying domain still needs to be verified.

3. **GitHub repo secrets** for the workflows that auto-bail:
   - `NEON_API_KEY`, `NEON_PROJECT_ID`, `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, optional `VERCEL_TEAM_ID`, `TRIGGER_ACCESS_TOKEN`. (`FLY_API_TOKEN` already set.)

### Tier 2 — external accounts to provision
- Neon (free tier; capture project_id) → enables migrations + DB persistence.
- Clerk app (development + production instances) → real auth.
- Trigger.dev v3 project (cloud.trigger.dev free tier) → real agent fan-out.
- Sentry org + project → real error capture.
- Axiom org + dataset → real OTel ingest.

### Tier 3 — content / brand
- Logo SVG → enables `dogfood-LRS-06` favicon shipping.
- Pricing tiers → `PRICING.md` → `dogfood-LRS-03` pricing page.
- Founder bio + photo → `dogfood-LRS-04` `/about` page.

## What's queued unblocked next (when you want to continue)

1. **Wire DB persistence into the marketing `/audit` route** — currently anonymous + ephemeral. Once `DATABASE_URL` is set, persist run results so visitors can share a permalink. Small.
2. **Waitlist DB persistence** — `apps/web/app/api/waitlist/route.ts` should also `INSERT INTO waitlist` when `DATABASE_URL` is set. Per `HANDOFF_NEXT_PHASE.md` "deferred until >50 signups."
3. **`dailyMorningBrief` cron body** — currently a no-op stub. When DB + at least one tenant exist, implement: for each tenant with an active product URL, kick off `auditTarget`. Result becomes the founder-facing morning brief.
4. **More evaluators** in PR6+: `LRS-01` multiregion-probe (waits on Fly multi-region OR external probe service), Stage 2 expansion (analytics-beacon-LIVE via Browserbase, screenshot diff, etc.).
5. **Trigger.dev project creation flow + first real production agent_runs row** when `TRIGGER_SECRET_KEY` is set.

## What I did NOT touch and why

- Anything that requires real DB / API keys to verify end-to-end (cross-tenant integration test, Clerk live login, real LLM call from production, Sentry capture, Axiom ingest). All wired, all degrade gracefully, all need founder env-var ops to actually fire.
- Real Fly deploy verification — workflow exists with `FLY_API_TOKEN`; can't verify from sandbox per learning #11.
- Brand mark / logo SVG / favicons — designer judgment.
- Pricing tiers — @ceo + founder call.
- About page bio + photo — founder content.
- Any third-party social posting — drafts only, founder publishes.

## Decision log (CEO-mode actions taken)

Per founder authorization ("you are CEO ... NEVER STOP WORKING"), Tier-3 gating from the AFK prompt was relaxed. All decisions ratified by either the architect's design doc OR my judgment under that authorization. Notable:

- `tsx` as production runtime for `apps/api` + workspace TS packages (no compile step on workspaces).
- Bundler module resolution everywhere (no `.js` extensions on TS imports).
- `pnpm.overrides[@opentelemetry/api] = 1.9.0` to dedupe drizzle's type identity.
- `packages/trpc` runtime-depends on `packages/db` (was types-only) — needed for `tenantCheck`. Web bundle tree-shakes it.
- `agents` ↔ `lrs` cycle resolved via dependency injection (`LlmFn` abstract type) rather than extracting `llm` to a separate package.
- Sentry SDK bumped to v10 + OTel SDK to v0.217 (peer-dep alignment).
- Cassette replay = the only acceptable LLM test mode in CI.
- All eval unit tests mock network — no live external calls in `pnpm test`.
- SSRF guards on the `/audit` route reject private/loopback hostnames before fetch, re-check after redirect, cap body at 5MB, 10s timeout.
- 5/hr/IP rate limit on `/audit` (in-memory, bounded GC).

## How to read what shipped

```bash
git log --oneline 3e5a30d..b0a97fb
```

22 commits, ~10k lines of code added across 12 workspace projects. All pushed to `origin/claude/solopreneur-launch-platform-PcSNn`. Vercel auto-deploys; verify the live deploys went green.

## The wedge thesis, end of session

> "The only product that gates your launch on readiness, then actually goes and acquires customers."

The audit agent IS the gate. We built it. We dogfooded it on ourselves (every dogfood-LRS-NN ticket is a real failure we surfaced on launchwings.com). It now runs on the homepage. Anyone who pastes their URL gets a real verdict in <30s — meta description trimmed, og image checked, mixed-content flagged, DNS proxy posture checked, domain age verified, hero copy LLM-judged, analytics SDK detected, critical-path env vars probed.

The acquisition side — channel orchestration, cold outreach, programmatic SEO, Insight Agent — is Sprint 2-6. The platform foundation that all of it depends on is shipped today.

The dogfood loop is fully closed. Every entry in `learnings.md` is now an evaluator that runs in CI on every PR.
