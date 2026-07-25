# PROD-03 — Cohort-Aware Channel Picker (F3)

*Status: P0. Sequencing: Phase 3 (Wk 11–13).*

## Why this exists

`docs/product/PRD.md` F3. F1 and F2 are the consumer surfaces. F3 is the brain — for every in-flight F1 action, surface the live cohort answer (`n`, median, confidence). Without F3 visible to the founder, the warehouse compounds for us but never for them.

## What it is

A query layer + UI surface that, given a candidate F1 action's `(channel, vertical_slice, week_offset)`, returns one of:

- `{ n, median, p_value, ε, "BetaList → 2.1× Uneed this week (n=47, p<0.05)" }`, OR
- `INSUFFICIENT_COHORT` (when k<50 or l<3 in the slice).

Surfaced on every F1 action card and on every F2 reply draft as the explainer for why we picked this action.

## Acceptance criteria

1. `tRPC cohort.benchmark({ channel, slice, weekOffset })` returns within p95 ≤ 200ms.
2. Every return value includes the ε noise level — no hidden confidence claims.
3. Web surface renders the cohort answer inline with the F1 action card. UI under 5KB additional JS.
4. `INSUFFICIENT_COHORT` is rendered plainly ("not enough launches in your slice yet — n=12") — no false confidence.
5. Drill-in on any benchmark shows the slice definition and the (anonymized) underlying counts.

## Tech

- `apps/api/src/cohort-benchmark.ts` — Hono route + tRPC proc.
- Reads from WHSE-01 aggregated views (`cohort_channel_weekly` etc.).
- Applies k≥50 + l≥3 gate at query time; rejects with `INSUFFICIENT_COHORT`.
- Adds Laplace noise on every numeric return.
- `apps/web/components/CohortBenchmarkCard.tsx`.

## Out of scope

- Public benchmark publication (gated at k≥200 + DP audit; Phase 4+).
- Cohort customization by the user (slices are platform-defined in v1).

## Dependencies

- WHSE-01 cohort warehouse.
- PROD-01 for the consumer surface.

## Tests + observability

- Property test: no aggregate read below k=50 or l=3 returns numeric data.
- Privacy test: chained queries cannot reduce effective ε below the per-slice budget.
- Langfuse trace on every benchmark return.

## Owner hand-off

When green, PROD-01's UI consumes the surface immediately. Public-benchmark publication tracked separately under Phase 4.
