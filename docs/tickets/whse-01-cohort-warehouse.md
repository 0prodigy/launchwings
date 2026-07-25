# WHSE-01 — Cohort outcome warehouse (F7)

*Status: P0. Sequencing: Phase 3 (Wk 11–13) — writes + k+l+DP gate. Phase 4 — hardening + public benchmark gates.*

## Why this exists

`docs/product/PRD.md` F7. The cross-cohort outcome warehouse is the only thing about LaunchWings a Claude plugin cannot replicate at any token budget — a plugin user is `n = 1`. Every finalized `revenue_event` row makes the next founder's F1 / F3 recommendations sharper.

## What it is

Anonymized aggregates over `revenue_event` rows tagged with `(launch_id, channel, copy_variant, ts)`. Three guarantees on every read:

1. **k ≥ 50** — at least 50 distinct launches in the queried slice; below threshold, return `INSUFFICIENT_COHORT`.
2. **l-diversity ≥ 3** — at least 3 distinct values for any sensitive attribute (channel, vertical, processor) in the slice; below threshold, suppress.
3. **Differential privacy** — Laplace mechanism on every numeric return, with `ε ∈ [2, 4]` configurable per slice, and the ε value published alongside every result.

The mechanism is hand-rolled TypeScript inside `apps/api` — ~10 LOC for the Laplace draw, an ε-budget accountant per slice, a per-slice query log, and tests that prove the gate cannot be bypassed via chained queries. No external library (Google's DP lib is JVM/Go/C++; IBM diffprivlib is Python; OpenDP WASM bloats Hono cold-start).

## Acceptance criteria

1. Trigger.dev task `cohort-outcome-writer` consumes finalized `revenue_event` rows and writes to anonymized aggregate tables (`cohort_channel_weekly`, `cohort_vertical_weekly`, `cohort_copy_variant_monthly`).
2. Every aggregate read enforces k ≥ 50 AND l-diversity ≥ 3 at query time. Below threshold returns `INSUFFICIENT_COHORT` with no numeric leak.
3. Laplace noise is added on every numeric return. ε is configurable per slice (default 2.0 for high-traffic slices, 4.0 for sparse slices). The ε value is included in the return payload.
4. ε-budget accountant prevents chained queries from reducing effective ε below the per-slice daily budget (default 10 queries/day per slice).
5. Per-tenant salt + global pepper hash on every dimension that could re-identify; salt-rotation runbook in `docs/operations/`.
6. First publishable benchmark slice (k ≥ 50, l ≥ 3) for the AI-build-platform vertical by 2027-01-15.

## Tech

- `apps/api/src/cohort/writer.ts` — Trigger.dev task.
- `apps/api/src/cohort/reader.ts` — query-time gate + Laplace noise.
- `apps/api/src/cohort/dp-accountant.ts` — ε-budget tracking per slice.
- Drizzle: `cohort_channel_weekly`, `cohort_vertical_weekly`, `cohort_copy_variant_monthly`, `dp_query_log`.
- Read consumer: PROD-03 (Cohort Channel Picker).

## Out of scope

- Public benchmark publication (gated at k ≥ 200 + DP audit; Phase 4+).
- Tenant-level cohort export (paid-tier feature post-validation).
- Cross-vertical pooling (each vertical slice is independent in v1).

## Dependencies

- ATTR-01 — `revenue_event` rows are the input.
- Drizzle migration slot for the aggregate tables.

## Tests + observability

- Property test: no read below k=50 or l=3 returns numeric data.
- Property test: chained queries cannot reduce effective ε below the per-slice budget.
- Property test: re-identification — given a published benchmark and the cohort-membership of a row, the row's exact contribution is not recoverable.
- Unit: Laplace draw distribution matches expected variance at given ε.
- Integration: end-to-end from `revenue_event` insert → aggregate write → PROD-03 read.

## Owner hand-off

When green, PROD-03 consumes the reader; BILL-01 month-end reconciliation reads aggregates for cap-vs-cohort sanity checks (post Phase 4).
