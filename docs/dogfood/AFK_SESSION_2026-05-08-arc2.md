# AFK Session — 2026-05-08 Arc 2 (post-feedback strategic redirect)

Continuation of `AFK_SESSION_2026-05-07-FINAL.md`. After founder review caught two strategic misses ("dogfood-as-public-narrative", "just-a-checklist isn't enough"), this arc executed a coordinated redirect from "audit demo" → "orchestration product".

## Bottom line

**Production advanced 14 commits**: `41a1f32 → b4e8e9c`. The product surface no longer reads as "free SEO scanner with a side of self-disclosure" — it reads as "specialist agent team, audit is the entry, here's exactly what each agent does."

## What's live (since arc 1)

### Marketing-side (visible)

- **`/about` reframed.** Removed the "North Star" investor-deck section, the "5/18 score / OG image was broken" self-disclosure, and the "wedge" jargon heading. Now: "How we work" — names the agents (drafting, submission, outreach, SEO, attribution) sharing one voice + audit + attribution layer. No founder bio, no metric publishing-plan disclosure, no internal jargon.
- **Hero banner pipeline.** `apps/web/scripts/fetch-hero-banner.mjs` runs in `prebuild`; pulls from Pollinations.ai (free, no key, no account); idempotent via cache file; soft-fails so build never breaks. Sandbox can't reach Pollinations (per learning #11) — Vercel build runner populates `apps/web/public/hero-banner.png` on first deploy.
- **`/audit` reframed as funnel.** Below results, a `<NextStepsCta>` card adapts to the score (severe / warning / clean) and pushes visitors to `/#waitlist`. The share-link moves below the CTA so the conversion path beats the share path.
- **Homepage refreshed.** Four features (was three) name the actual agents: audit, drafts in your voice, submissions to 30+ directories, the daily brief. Hero subhead lists them in order; secondary CTA pushes audit-first.

### Engineering — three new orchestration agents

- **Social Drafts Agent.** `packages/agents/src/tasks/social-draft.ts`. Generates X / LinkedIn drafts from a product brief, in the founder's voice, with cassette-replay tests. Voice corpus loads from `docs/dogfood/posts/`. Persists to new `social_drafts` table (migration 0004, RLS scoped). tRPC: `social.runSocialDraft`, `social.listDrafts`, `social.setDraftStatus`.
- **Insight Agent + dailyMorningBrief.** `packages/agents/src/tasks/insight.ts` + cron body filled. Daily 06:00 UTC, fans out per-tenant; gathers KPIs (audits, drafts, submissions, signups, paying); LLM judges; writes one row per tenant per UTC day to `insight_daily_briefs` (migration 0006, unique on `(tenant_id, brief_for)`). Idempotent via ON CONFLICT. Degraded-fallback when LLM fails. tRPC: `insight.getLatestBrief`, `listBriefs`, `markBriefRead`, `runInsightNow`.
- **Directory Submitter Agent.** `packages/agents/src/tasks/directory-submitter.ts` + 31-entry catalog (`packages/agents/src/directories/catalog.ts`). 12 launch + 7 review + 6 forum + 3 social + 2 directory + 1 newsletter, prioritised for B2B SaaS / dev tool / AI ICP. Generates blurbs in voice (mod LLM via cassette tests). Persists to `directory_submissions` (migration 0005, RLS scoped). Manual entries jump straight to `needs_manual` for daily-brief surfacing. tRPC: `directory.prepareDirectorySubmissions`, `listSubmissions`, `approveSubmission`, `getDirectoryCatalog`.

### Engineering — moat / governance

- **Build-platform detection PR1 (Level 1).** `packages/lrs/src/detect/build-platform.ts` + `packages/lrs/src/evaluators/build-platform.ts`. Detects Lovable / Bolt / v0 / Replit / Cursor / Paperclip / Pickaxe via subdomain + HTML meta + asset URLs + headers. Persists detections to `product_build_platform_detections` (anonymous-OK like `lrs_runs`). 10-platform enum + reference catalog (`build_platforms` table; seeded). 26 detection + 8 evaluator tests. This is the long-term distribution moat per ADR-0002 — every audit becomes a tagged signal.
- **Designer agent.** Trigger.dev v3 `generateHeroImage` task in `packages/agents/src/tasks/designer.ts` + `.claude/agents/designer.md` definition. Calls Pollinations.ai for free image gen. Caller persists bytes to R2/storage; the marketing-site banner is build-time. 9 tests.
- **Copy-review agent + CI scanner.** `apps/web/scripts/check-public-copy.mjs` + `copy-review.config.json` (deny list: north-star, wedge, ICP, TAM, ARR, pre-mortem, ADR-NN, dogfood-LRS-NN, etc.) + `.github/workflows/copy-review.yml` + `.claude/agents/copy-review.md` definition. Caught the founder's North-Star concern AND now blocks every PR that would re-introduce that class. Scanner is deterministic; agent definition handles nuance (tone, audience, framing).
- **OpenAI-default LLM mode.** `pickAvailableModel(preferredProvider?)` in `packages/agents/src/llm.ts`. With only `OPENAI_API_KEY` set (current state per founder), the default is `openai:gpt-5`. Anthropic key drops in seamlessly later. `packages/lrs/src/evaluators/hero-llm-judge.ts` mirrors the picker via DI to keep the agents↔lrs cycle resolved.

## Test counts (workspace, all in mock/cassette mode)

| Package | Before this arc | After this arc |
|---|---|---|
| `@launchwings/agents` | 17 | 64 (+47) |
| `@launchwings/lrs` | 110 | 146 (+36) |
| `@launchwings/web` build | green | green |
| `check:assets` | green | green |
| `check:copy` | n/a | green (0 findings) |

Zero live API calls in CI. All LLM tests are cassette-replay.

## Workflows that auto-bail without their secret

| Workflow | Secret |
|---|---|
| `setup-04-trigger-deploy.yml` | `TRIGGER_ACCESS_TOKEN` ✅ |
| `setup-07-neon-branch-pr.yml` | `NEON_API_KEY`, `NEON_PROJECT_ID` ✅ |
| `setup-07-playwright-smoke.yml` | `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` ✅ |
| `setup-01b-fly-deploy.yml` | `FLY_API_TOKEN` ✅ |
| `web-001-link-check.yml` | (none) |
| `lrc-01-test.yml` | (none) |
| `setup-05-agents-test.yml` | (none) |
| `copy-review.yml` | (none) |

All required GitHub repo secrets are now set per founder. CI should be unblocking.

## Strategic shifts captured

1. **Authority before humility.** A product whose wedge is "we gate your launch on readiness" cannot publicly self-disclose its own failures. Build-in-public posts on X/LinkedIn are FOUNDER-side content (separate channel); the product positioning page must stay authority-leaning.
2. **The audit is the funnel, not the product.** Every pre-launch SaaS audit tool (PSI, SEMrush, Ahrefs site audits, Pingdom) ships the same surface in a weekend. The defensible product is the orchestration layer. Three orchestration agents shipped this arc to back the claim.
3. **Build-platform integrations are the long-term moat.** ADR-0002 explicitly defers deploy-as-our-feature in favour of being the launch partner where founders already build. Level 1 detection lands today; Levels 2-5 unlock as partners agree.
4. **Voice continuity = differentiation.** Cassette-replay isn't only a CI hygiene practice — it's the guard that ensures every artifact (draft, blurb, brief) sounds like the same product. Hard to clone.
5. **Copy-review is mandatory before public surface ships.** The North-Star incident showed the gap; the scanner + agent close it. Every PR touching `apps/web/app/**` runs through the deny list.

## Founder follow-ups (priority order)

1. **Verify Vercel deploy** of the production branch went green — `apps/web/public/hero-banner.png` populated by the prebuild step (Pollinations is reachable from Vercel runners; sandbox can't verify).
2. **Verify Fly deploy** ran on the api commits since `apps/api` last touched. `https://launchwings-api.fly.dev/health` returning 200.
3. **Trigger.dev project + Neon project** still need first-time creation in the dashboards. Once `DATABASE_URL` and `TRIGGER_*` are set in Vercel + Fly secrets, all three orchestration agents go from "tested" to "production-runnable."
4. **Designer image budget.** Pollinations is free but rate-limits aggressively at scale. When we cross 100 hero generations, swap the Designer agent's provider to `fal.ai` (Stack manifest already lists it) and budget; or self-host an SDXL endpoint once economics warrant.
5. **A founder-facing surface.** `/audit` is the only product UI today. Once founders sign up, they need somewhere to see their drafts / submissions / briefs. The Supabase/Vercel-style metrics dashboard you flagged "for later" is the right shape — explicitly deferred per direction.

## What's queued unblocked next

In priority order if I continue:

1. **Stage 2 LRS evaluators** — analytics-beacon-LIVE (Browserbase), screenshot diff, performance budgets via PSI. Stage 1 is enough for the demo; Stage 2 unlocks the per-deploy regression watchdog.
2. **Build-platform integration PR2** — Level 2 (Replit data API + Lovable preview crawl + v0 share-link OG). Free intelligence on top of Level 1.
3. **Founder dashboard skeleton** — even a 50% version of the Supabase-style dashboard (just lists drafts / submissions / briefs / audits, no fancy graphs) closes the loop for first beta tenants.
4. **Stripe / Lemon Squeezy / Paddle / Polar attribution wiring** — the "paying customers, not signups" promise needs payment-provider webhooks.
5. **More build-in-public post drafts.** The cadence is 2x/week per `HANDOFF_NEXT_PHASE.md`. Two drafts queued from arc 1 (the wedge-live + silent-fail-pattern posts). Today's Social Drafts + Directory Submitter ship and homepage refresh are post-worthy.

## Continuation — secrets & cloud bootstrap strategy

Founder reported that the GH repo secrets are all set but the actual cloud projects haven't been used yet: Trigger.dev project never deployed to, Fly app never launched, Neon project has zero tables. They asked whether to paste the secrets into chat for me to bootstrap from, or whether I had a different strategy.

**Strategy chosen: don't paste secrets anywhere. Bootstrap runs in GH Actions where the secrets already live.** A pasted secret lands in chat history, screen recordings, and the AFK orchestrator's conversation logs; the runner is the only place that already has reach + already has the secrets.

### What landed

- **`.github/workflows/setup-00-bootstrap.yml`** — `workflow_dispatch` only. Resolves the Neon primary-branch connection string via the Neon API (`NEON_API_KEY` + `NEON_PROJECT_ID`), masks both pooled and unpooled URIs, runs `pnpm --filter @launchwings/db db:migrate` against the unpooled URI, then propagates `DATABASE_URL` + `DATABASE_URL_POOLED` to (a) Fly via `flyctl secrets set --stage --app launchwings-api` and (b) Vercel prod target via the Vercel REST API (delete-then-recreate so re-runs don't dupe). Connection strings are never echoed, never written to `GITHUB_ENV`, never stored as artifacts. Toggleable via `apply_migrations` / `push_to_fly` / `push_to_vercel` inputs for partial re-runs.
- **`docs/DEV_SETUP.md`** — short ops note. Lists the required repo secrets, documents the bootstrap dispatch order (`setup-00` → `setup-01b` → re-dispatch `setup-00` so Fly app exists before secrets ship → `setup-04`), and the local-dev pattern: spin a Neon dev branch via `neonctl` and write the URI into `apps/web/.env.local` (gitignored).

### Why this shape

- **Reusability over one-shot.** The same workflow re-applies migrations after a schema change and re-syncs `DATABASE_URL` after a Neon endpoint rotation. No special-casing.
- **No human in the secret path.** I never see the URI; the founder never has to paste; each rotation is one `gh secret set` + one re-dispatch.
- **Bail-fast pattern reused.** Mirrors the existing `setup-01b` / `setup-04` / `setup-07` style — the workflow refuses to start if `NEON_API_KEY` / `NEON_PROJECT_ID` aren't set, with the exact `gh secret set` command in the error.
- **Trigger.dev + Fly self-bootstrap.** Trigger's project is bound by the access token, so `setup-04` creates the deployment on first dispatch. Fly's `setup-01b` already calls `flyctl launch --no-deploy` if the app is missing. So the only NEW bootstrap-creation work needed was the Neon migrate hop.

### Founder dispatch order (one-time)

```
gh workflow run setup-00-bootstrap.yml         # Neon migrate + push DATABASE_URL
gh workflow run setup-01b-fly-deploy.yml       # Create + deploy launchwings-api
gh workflow run setup-00-bootstrap.yml \       # Re-run so Fly receives the secret
  -f push_to_vercel=false
gh workflow run setup-04-trigger-deploy.yml    # Deploy agents to Trigger.dev v3
```

After step 4, the three orchestration agents (Social Drafts / Insight / Directory Submitter) are production-runnable end-to-end.

### What this does NOT do

- Does not push `OPENAI_API_KEY` to Fly / Vercel — that secret is per-platform, founder sets it once via `flyctl secrets set` + Vercel dashboard. (Could fold it in later if it becomes a recurring rotate.)
- Does not push runtime env to Trigger.dev — Trigger has its own env management; either the dashboard or a future `trigger.dev env push` step.
- Does not handle the Neon-Vercel marketplace integration that auto-injects per-PR `DATABASE_URL`s into preview deploys — still a one-time founder click in the Vercel UI per `setup-07-neon-branch-pr.yml`'s header.

## Push log

`claude/solopreneur-launch-platform-PcSNn`: `41a1f32 → b4e8e9c` (14 commits across the arc). Feature branches all preserved on origin for traceability. Worktrees retired automatically post-cherry-pick.

`claude/continue-afk-session-docs-BEP6Z`: this continuation. Adds `setup-00-bootstrap.yml` + `docs/DEV_SETUP.md` and amends this AFK doc.

### Follow-up: secrets are environment-scoped, not repo-scoped

First dispatch revealed the real shape of the repo's secret store:

- **All secrets live under the `Production` GitHub Actions Environment**, not at the repo level. The "Repository secrets" section is empty.
- Workflows that don't declare `environment: production` on their job see every `secrets.*` reference as `''`, which is what made `setup-01b` deploy with no `FLY_API_TOKEN` even though the AFK doc claimed it was set.
- **`TRIGGER_PROJECT_REF` is missing** from the Production env (only `TRIGGER_ACCESS_TOKEN` is there). `setup-04` will silently bail until it's added: `gh secret set TRIGGER_PROJECT_REF --env production`.

Workflow fixes pushed:

- `setup-00-bootstrap.yml`, `setup-01b-fly-deploy.yml`, `setup-04-trigger-deploy.yml`, `setup-07-neon-branch-pr.yml`, `setup-07-playwright-smoke.yml` — all now declare `environment: production` on their job.
- `setup-01b` and `setup-04` had a real bug: their bail-fast step ran `exit 0` and let subsequent steps run anyway (which is how `setup-01b` "succeeded" past the bail then failed on deploy). Replaced with an `id: gate` + `steps.gate.outputs.skip` pattern so missing-secret runs cleanly skip every downstream step instead of half-running.
- `docs/DEV_SETUP.md` — documents the `environment: production` requirement and the `gh secret set --env production` rotation pattern.

### Updated dispatch order

After cherry-picking this onto the default branch (`claude/solopreneur-launch-platform-PcSNn`):

```
gh secret set TRIGGER_PROJECT_REF --env production            # one-time fix for the missing secret
gh workflow run setup-00-bootstrap.yml                        # Neon migrate + push DATABASE_URL to Fly+Vercel
gh workflow run setup-01b-fly-deploy.yml                      # Create + deploy Fly app
gh workflow run setup-00-bootstrap.yml -f push_to_vercel=false  # Re-stage Fly secrets now that the app exists
gh workflow run setup-04-trigger-deploy.yml                   # Deploy agents to Trigger.dev v3
```

### Follow-up 2: pnpm version conflict + Fly billing + Trigger.dev binary resolution

Second dispatch surfaced three more issues:

- **`pnpm/action-setup@v4` errored with `ERR_PNPM_BAD_PM_VERSION`** because every workflow was specifying `with: version: ...` and `package.json` declares `"packageManager": "pnpm@10.33.0"`. The action refuses to run when both are set, regardless of whether the values match. Fix: dropped `with.version` from all eight workflows; `package.json` is the single source of truth.
- **Fly app creation hit `We need your payment information to continue`** because the org has no card on file, then the deploy step ran anyway and got `app not found`. Two fixes pushed:
  - `setup-01b` now `set -euo pipefail`s through `flyctl apps create` (no more silent `|| true`) and surfaces a precise error pointing at `https://fly.io/dashboard/<org>/billing`. The deploy step won't run if creation failed.
  - The org slug is now driven by a repo Variable: `vars.FLY_ORG ?? 'personal'`. This repo's org is `launch-wings`, so founder runs `gh variable set FLY_ORG --body "launch-wings"` once.
  - **Manual founder action: add a card on Fly billing before the next setup-01b dispatch.** Fly refuses to create even free-tier apps without one.
- **`pnpm --filter @launchwings/agents exec trigger.dev` failed with `Command "trigger.dev" not found`** even though `trigger.dev` is in the package's devDependencies. pnpm 10 with isolated installs doesn't reliably resolve workspace-package binaries through `--filter ... exec`. Fix: switched `setup-04` to `working-directory: packages/agents` + plain `pnpm exec trigger.dev deploy`, which uses the package's local `node_modules/.bin`.

### Follow-up 3: dropped Fly entirely; apps/api now on Vercel

Founder pushback: Fly required a card on file even for the free tier and we're already paying for Vercel. Audit of `apps/api` confirmed the api is a **stateless Hono server** — no SSE, no WebSockets, no long-running connections. Trigger.dev v3 already owns durable agent work. There is no architectural reason apps/api needed a long-lived runtime.

Decision: **deploy apps/api as a separate Vercel project via `hono/vercel`.** Keeps the provider count down to two (Vercel + Trigger + Neon), removes the Fly billing pickle, drops the Dockerfile + fly.toml from maintenance, and unifies the secret-rotation story.

What changed:

- **apps/api refactored.** `src/app.ts` is the new home for the Hono `app` (middleware + routes + tRPC mount); `src/index.ts` shrinks to a Node bootstrap (used for local dev / `pnpm dev`). New entrypoint `apps/api/api/index.ts` imports `instrumentation` first, then `handle(app)` from `hono/vercel`. `apps/api/vercel.json` rewrites `/(.*) → /api` so every path reaches the Hono app, which routes by its own router.
- **New workflow `setup-01b-vercel-api-deploy.yml`.** Uses `vercel pull` → `vercel build --prod` → `vercel deploy --prebuilt --prod` against a new `VERCEL_API_PROJECT_ID` (env secret under Production). Smoke-checks `/health` on the returned URL. Replaces the deleted `setup-01b-fly-deploy.yml`.
- **`setup-00-bootstrap.yml` reshaped.** Dropped the Fly leg entirely. The Vercel-env-upsert step now iterates BOTH `VERCEL_PROJECT_ID` (web) and `VERCEL_API_PROJECT_ID` (api), with independent `push_to_web_vercel` / `push_to_api_vercel` toggles for partial re-runs. Same delete-then-create encrypted-env routine, refactored into a shell function.
- **Deleted:** `apps/api/Dockerfile`, `apps/api/fly.toml`, `.github/workflows/setup-01b-fly-deploy.yml`. Last-known-good Fly state lives at commit `33aac01` if we ever want to bring it back.
- **DEV_SETUP.md updated.** Removed `FLY_API_TOKEN` from the required-secrets table, added `VERCEL_API_PROJECT_ID`, rewrote the dispatch order, and prefixed it with the one-time founder action of creating the second Vercel project.

Founder action items:

1. **Create a second Vercel project** that points at this repo, with `Root Directory: apps/api` and `Framework Preset: Other`. Leave install / build / output commands at defaults (`@vercel/node` compiles `api/index.ts` automatically).
2. **`gh secret set VERCEL_API_PROJECT_ID --env production --body "prj_..."`** with the new project id.
3. (Still outstanding from arc-2 follow-up 1) **`gh secret set TRIGGER_PROJECT_REF --env production`** — currently missing, blocks setup-04.
4. Re-dispatch in order: `setup-00-bootstrap.yml` → `setup-01b-vercel-api-deploy.yml` → `setup-04-trigger-deploy.yml`.
```

### Follow-up 4: web → api wiring via Next rewrite (Option B chosen)

apps/web reaches apps/api via a Next rewrite, not a separate domain. Source `/trpc/*` on the web origin is proxied edge-side to `${INTERNAL_API_URL}/trpc/*` (see `apps/web/next.config.ts`). `INTERNAL_API_URL` is a server-only env on the apps/web Vercel project; default fallback `https://dot-api.vercel.app` matches the project alias. Why `/trpc/*` not `/api/*`: `apps/web/app/api/*` already hosts Next Route Handlers (audit, waitlist) that must keep being served by Next.

Result: no CORS, no second domain, no api URL in client bundles. tRPC client (when wired) uses a relative `/trpc` baseUrl.

### Follow-up 5: founder git identity recorded

Vercel rejected a deploy because the HEAD commit was authored as `noreply@anthropic.com`. Pinned `akash@lyric.tech` in `.git/config` for this clone and recorded the durable instruction in `CLAUDE.md` so future sessions / clones re-set it before committing.

### Follow-up 6: deleted setup-01b-vercel-api-deploy.yml — Vercel GH integration is the deploy

Founder pointed out: Vercel's GitHub integration auto-deploys on every push to the default branch. A separate `vercel deploy` workflow is duplicate work and a second source of failure. Deleted `.github/workflows/setup-01b-vercel-api-deploy.yml`. Both `apps/web` and `apps/api` projects now deploy purely via Vercel's GitHub integration: push → auto deploy → check the Vercel dashboard.

To force a redeploy without touching code:

```bash
git commit --allow-empty -m "redeploy: <reason>"
git push
```

The remaining manual-dispatch workflow is `setup-00-bootstrap.yml` (Neon migrations + DATABASE_URL push to both Vercel projects). Trigger.dev still needs `setup-04-trigger-deploy.yml` because it has its own CLI deploy hop, not a GitHub integration.

### Follow-up 7: apps/api Vercel config corrected

Two errors from the auto-deploy attempts:

- **dot-api was building apps/web too.** Vercel's monorepo auto-detection ran `turbo run build` repo-wide, pulling in every package with a `build` script. Fix: explicit `buildCommand: "cd ../.. && pnpm --filter @launchwings/api build"` in `apps/api/vercel.json` (mirrors the apps/web pattern). Now only the api builds.
- **`No Output Directory named "public" found`** persisted because Vercel was looking at the repo root, not at apps/api. The right Root Directory in the dashboard is `apps/api`, NOT empty. Earlier "leave blank" advice was wrong — the path-doubling that motivated it was specific to the deleted workflow's `working-directory: apps/api` clause. With Vercel's GH integration (no workflow), Root Directory = `apps/api` is correct.

apps/api/public/index.txt is committed so the directory always exists regardless of build cache state. apps/api/vercel.json now has `installCommand`, `buildCommand`, and `outputDirectory: "public"`. turbo.json env list includes `DATABASE_URL`, `DATABASE_URL_POOLED`, `INTERNAL_API_URL`.

**Founder action:** in the Vercel dashboard for the `dot-api` project, change Root Directory to `apps/api` (it was set to empty per the earlier wrong advice).
