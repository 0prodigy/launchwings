# LaunchWings

> **Status: work in progress, mid-pivot. Not verified to install, build, or run. Do not treat anything below as a working product.**

This repo is an active experiment, not a finished product. It has changed
product direction twice in the two weeks it has existed, the code has not
been confirmed to `pnpm install`, type-check, or pass its test suite on this
snapshot, and a meaningful share of the code is **leftover scope from an
earlier pivot** that predates the current direction. Treat this as a
snapshot of in-flight work, not a release.

## What this is trying to be

LaunchWings started as a "launch readiness" audit tool for solopreneurs
(score a landing page, flag missing OG tags / analytics / legal pages,
suggest fixes). It then pivoted toward an **AI launch-concierge for
Instagram + Facebook–native product brands** — the idea being that an
independent brand (streetwear, capsule drops, Shopify-based) could hand the
system its voice (past captions, product copy, DM history) and have it draft
on-brand launch posts, DM replies, and Shopify lifecycle messages for founder
approval before anything goes out.

As of the most recent commit in `docs/mission/`, that IG/FB direction is
itself being reconsidered again in favor of a third framing — "take a GitHub
repo (or an already-live URL) and help make it live and get its first
customers" (see `docs/decisions/0007-pivot-to-github-to-live-and-customers.md`).
That ADR is marked **proposed**, was written under autonomous/AFK operation,
and has not been confirmed by the project owner. In short: the docs describe
three overlapping product ideas in various states of "decided," and the code
in this repo mostly still reflects the *first* one. Read
`docs/mission/MISSION.md` → `docs/mission/HANDOFF.md` for the authoritative,
up-to-date account of which direction is live; don't take this README's
framing as more current than those files.

## Current state, plainly

- **Install/build/test: not verified on this snapshot.** The project's own
  handoff notes (`docs/mission/HANDOFF.md`) say so explicitly — a baseline
  `pnpm install` + type-check + test pass was queued but its result was never
  recorded here.
- **Legacy code is still mixed in.** The audit/scoring engine
  (`packages/lrs`), the directory-submission and discovery agents
  (`packages/agents/src/tasks/{directory-submitter,discovery,designer,positioning,import-product,insight}.ts`),
  and their DB tables (`lrs_runs`, `lrs_results`, `directory_catalog`,
  `directory_submissions`, `build_platforms`, ...) belong to the original
  solopreneur-audit product, not the current direction. `docs/mission/MISSION.md`
  itself flags this inherited code as "mostly legacy ... to be harvested or
  retired" and only reuses a few pieces (the LLM wrapper, the cassette test
  harness, the db/tRPC plumbing, one voice-extraction experiment).
- **No paying customer, no live deployment, no LICENSE chosen yet.**
- Dormant since 2026-05-29 (last activity date in this snapshot).

## Architecture (what's actually implemented)

A pnpm + Turborepo monorepo:

| Path | What it is |
|---|---|
| `apps/web` | Next.js 15 app — marketing/waitlist landing page, the original audit tool's UI (`/audit`), and an in-progress dashboard (`/app`) behind Clerk auth. Tailwind v4, PostHog analytics, Resend for email, Cloudflare Turnstile on the waitlist form. |
| `apps/api` | Hono API on Node, deployed as Vercel Functions. Hosts the tRPC router, Clerk middleware, and `/health` + `/ready` endpoints. |
| `packages/db` | Drizzle ORM schema + SQL migrations against Postgres (Neon in the cloud target). Tables span both eras: `tenants`/`users`/`products`/`waitlist`/`social_drafts` (current-ish) and `lrs_runs`/`lrs_results`/`directory_catalog`/`directory_submissions`/`build_platforms` (legacy audit tool). |
| `packages/trpc` | Shared tRPC router + procedures consumed by `apps/api` (server) and typed by `apps/web` (client). |
| `packages/agents` | LLM task/agent layer (Anthropic/OpenAI via a thin `llm()` wrapper), Trigger.dev v3 task definitions, and a cassette-replay harness so tests don't need live API keys. |
| `packages/observability` | Shared Sentry + OpenTelemetry init, gated on env vars so a missing DSN/endpoint no-ops instead of crashing boot. |
| `packages/lrs` | The original "Launch Readiness Score" evaluator engine — a registry of ~18 checks (SEO meta, OG images, legal pages, analytics beacon, an LLM-judged hero section, etc.) that score a live URL. Legacy per the current direction; not yet retired. |
| `docs/` | Product/architecture/decision history — start at `docs/mission/MISSION.md`, then `docs/mission/HANDOFF.md`, then `docs/decisions/` (ADRs 0001–0007) for how the direction got here. |

Auth is Clerk, error/trace reporting is Sentry + OpenTelemetry, the DB layer
is Drizzle-on-Postgres, and `apps/web`'s Playwright config (`apps/web/playwright.config.ts`)
and Vitest suites are the two test surfaces — neither has been run to confirm
green on this snapshot.

## Environment variables

Nothing in this repo should contain a live secret — every credential is read
from `process.env` via `zod`-validated schemas (see `apps/api/src/env.ts`,
`packages/db/src/env.ts`, `packages/observability/src/env.ts`), and every var
those schemas expect is documented with a placeholder in:

- `apps/web/.env.local.example`
- `apps/api/.env.example`

Copy the relevant file, fill in your own keys (Clerk, Resend, Turnstile,
PostHog, Sentry, a Postgres URL, LLM provider keys, etc.), and never commit
the filled-in copy — both filenames are gitignored.

## Running it (unverified — expect friction)

```bash
pnpm install
cp apps/web/.env.local.example apps/web/.env.local   # fill in real values
cp apps/api/.env.example apps/api/.env               # apps/api does not auto-load this yet — export the vars yourself
pnpm dev            # turbo run dev across the workspace
pnpm type-check      # turbo run type-check
```

These are the commands the `package.json` scripts imply, not a confirmed
working path — see "Current state, plainly" above. If something fails, that
is expected information, not a bug you're expected to have caused.

## Where to actually read next

1. `docs/mission/MISSION.md` — the reconciled direction and the pivot log, updated at every checkpoint.
2. `docs/mission/HANDOFF.md` — latest known state, what's verified vs not, what's next.
3. `docs/mission/BACKLOG.md` — the ordered work list, including the still-open "OSS hygiene" item this README partially addresses.
4. `docs/decisions/` — ADRs 0001 through 0007, in order, for the full pivot history.
