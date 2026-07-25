# OBSERVABILITY

> Operational guide for SETUP-06 (`OpenTelemetry + Sentry + Axiom wiring`). Covers the env-var contract for `apps/web`, `apps/api`, and Trigger.dev workers, plus the founder-owned account-creation steps that have to happen out-of-band.

The goal of SETUP-06 is **one trace visible end-to-end web → api → LLM**. The runtime wiring lives in `packages/observability`; both apps call `initOtel` + `initSentry` at boot and **bail-graceful** when the matching env vars are unset (single-line JSON warn, never crash). That means:

- A founder can ship to production with zero telemetry env vars set and the apps still boot. Logs surface as `console.log`/`console.error` only — no Axiom, no Sentry, no traces.
- Once the founder provisions accounts and sets the env vars, telemetry turns on with no code change.

---

## Env-var contract

| Var | Where to set | Used by | Purpose |
|---|---|---|---|
| `SENTRY_DSN` | Fly secrets (api), Vercel env (web — server-side runtimes) | api, web (server) | Server-side error capture. |
| `NEXT_PUBLIC_SENTRY_DSN` | Vercel env (web) | web (browser) | Client-side error capture. Same DSN value as `SENTRY_DSN`; Next's `NEXT_PUBLIC_` prefix is what makes it visible to the browser bundle. |
| `SENTRY_ORG` | Vercel env (web build) | web build | Sentry org slug for source-map upload during `next build`. |
| `SENTRY_PROJECT` | Vercel env (web build) | web build | Sentry project slug. |
| `SENTRY_AUTH_TOKEN` | Vercel env (web build, **encrypted**) | web build | Auth token for source-map upload. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Fly secrets (api), Vercel env (web) | api, web | OTLP HTTP traces endpoint. For Axiom: `https://api.axiom.co/v1/traces`. |
| `OTEL_EXPORTER_OTLP_HEADERS` | Fly secrets (api), Vercel env (web) | api, web | Header pairs, e.g. `Authorization=Bearer xaat-...,X-Axiom-Dataset=launchwings`. |
| `AXIOM_TOKEN` | Fly secrets (api), Vercel env (web) | api, web | Alternative split form — supply this + `AXIOM_DATASET` instead of `OTEL_EXPORTER_OTLP_HEADERS` and the package builds the headers itself. |
| `AXIOM_DATASET` | Fly secrets (api), Vercel env (web) | api, web | Axiom dataset name. Recommend `launchwings-prod` / `launchwings-preview`. |
| `SERVICE_VERSION` | Set by deploy pipeline | api, web | Tag for Sentry releases + OTel resource. Defaults to `GIT_SHA` (api) or `VERCEL_GIT_COMMIT_SHA` (web). |

`apps/api/src/env.ts` declares all of the above as zod-optional; missing values produce a warn line at boot and disable the corresponding subsystem. No production crash.

---

## Founder follow-ups (out-of-scope of SETUP-06)

These are real-account / billing tasks the founder owns. The code is wired and waiting.

### 1. Sentry

1. Create a Sentry account (https://sentry.io) — free tier is fine for v1.
2. Create two projects: `launchwings-web` (Next.js platform) and `launchwings-api` (Node platform).
3. Copy each project's DSN.
4. Vercel (web): set `SENTRY_DSN` (server) **and** `NEXT_PUBLIC_SENTRY_DSN` (same value, browser-visible) on Production + Preview environments. Set `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` on Production only (source-map upload).
5. Fly (api): `fly secrets set SENTRY_DSN=...` on the api app.

### 2. Axiom

1. Create an Axiom account (https://axiom.co) — free tier is 0.5 TB ingest/mo.
2. Create one dataset per environment: `launchwings-prod`, `launchwings-preview`.
3. Create an API token (Settings → API Tokens) with ingest permission on those datasets.
4. Pick **one** of the two configuration shapes:
   - **Pre-built header form**: set `OTEL_EXPORTER_OTLP_ENDPOINT=https://api.axiom.co/v1/traces` and `OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer xaat-...,X-Axiom-Dataset=launchwings-prod`.
   - **Split form**: set `AXIOM_TOKEN=xaat-...` and `AXIOM_DATASET=launchwings-prod`. The observability package fills in the endpoint + headers.
5. Set those env vars on Vercel (web, both Production + Preview, with appropriate dataset per env) and Fly (api).
6. Verify ingest: hit `apps/web` → it calls `apps/api` → trace appears in Axiom under the configured dataset within ~30s.

### 3. Phoenix tracing (deferred)

`SPRINT_01.md` SETUP-06 acceptance lists Phoenix. Sub-decision: we ship OTel exporter to Axiom in this PR; Phoenix tracing for **LLM-call inspection** is part of SETUP-05 (LLM wrapper) — Phoenix has a Python-first SDK and we'll plug it in via the `@arizeai/openinference-instrumentation-*` JS adapters when the LLM wrapper lands. Tracking note left in SETUP-05's design doc when it lands.

### 4. Grafana dashboard (deferred)

The SPRINT_01 acceptance asks for a "single-pane Grafana dashboard with: request rate, error rate, p95 latency, daily LLM spend." Axiom has its own dashboarding that satisfies the first three; LLM spend lands in SETUP-05's `agent_runs` table and dashboards over Postgres are a separate ticket. Defer Grafana wire-up until those data sources exist.

---

## Code surface (where to look)

- `packages/observability/src/index.ts` — public exports: `initOtel`, `initSentry`, `logEvent`, `withSpan`, `captureException`.
- `packages/observability/src/otel.ts` — Node SDK + OTLP HTTP exporter; dynamic-imports the SDK so packages that don't initialise it don't pay the cost.
- `packages/observability/src/sentry.ts` — `@sentry/node` init + `captureException` helper that no-ops when uninitialised.
- `apps/api/src/instrumentation.ts` — first-import side-effect file that calls both initialisers. **Must stay first import in `apps/api/src/index.ts`** so OTel auto-instrumentations patch http/pg/etc. before anything loads them.
- `apps/web/instrumentation.ts` — Next 15 instrumentation hook; runs only in the nodejs runtime.
- `apps/web/sentry.client.config.ts` / `apps/web/sentry.server.config.ts` — `@sentry/nextjs` conventional entry points.
- `apps/web/next.config.ts` — wraps with `withSentryConfig` only when `SENTRY_DSN` is set.
