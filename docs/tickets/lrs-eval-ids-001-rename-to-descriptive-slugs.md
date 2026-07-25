## LRS-EVAL-IDS-001 — Rename `dogfood-LRS-NN` evaluator IDs to descriptive slugs

**Intent**: Copy-review scanner caught `dogfood-LRS-08` / `dogfood-LRS-07` strings shipped in `apps/web/components/audit-results-panel.tsx` (programmatic ID comparisons). The IDs render to users as code badges; strictly they leak internal ticket nomenclature. Inline `// copy-review: ignore` annotations are in place as a stop-gap. The proper fix is renaming the evaluator IDs themselves.

**Acceptance**:
- `packages/lrs/src/evaluators/*.ts`: each evaluator's `id` becomes a descriptive slug. Proposed mapping:
  - `dogfood-LRS-02` → `hero-llm-judge`
  - `dogfood-LRS-05` → `mixed-content`
  - `dogfood-LRS-06` → `favicon-presence`
  - `dogfood-LRS-07` → `og-image`
  - `dogfood-LRS-08` → `meta-description-length`
  - `dogfood-LRS-09` → `domain-age`
  - `dogfood-LRS-11` → `analytics-beacon-static`
  - `dogfood-LRS-12` *(future)* → `waitlist-silent-fail-probe`
  - `LRS-DNS-001` → `dns-proxy-posture` (already descriptive — keep)
  - `LRS-CRITICAL-PATH-001` → `critical-path-env` (already descriptive — keep)
- `apps/web/components/audit-results-panel.tsx`: switch the two equality checks to the new slugs; remove the `copy-review: ignore` annotations.
- Persisted `lrs_results.evaluator_id` rows from before the rename keep working (the audit page handles unknown IDs as generic — no migration needed because the column is `text` and the app gracefully falls back).
- Tests in `packages/lrs/src/__tests__/evaluators/*.test.ts`: update id assertions.
- A new ticket reference in each evaluator's source code that points to the original `docs/tickets/dogfood-LRS-NN-*.md` for traceability.

**Out of scope**:
- Renaming the ticket files in `docs/tickets/` — those are internal docs and keep their numbered shape.
- Database migration to back-fill old evaluator_id rows — they remain as historical records.

**Estimate**: 0.5d. **Owner**: AI eng. **Bundle**: operational dogfood (informs the customer-facing surface).
