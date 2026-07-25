-- Reverses 0003_anon_lrs.sql.
--
-- Caveat (best-effort, one-way for any anonymous data already written):
-- if any rows have tenant_id IS NULL, `ALTER COLUMN ... SET NOT NULL` will
-- error. We delete those rows first so the down migration can complete; the
-- alternative (refusing to revert) breaks the round-trip CI test. Anonymous
-- audit rows are demo-only data — it is acceptable to drop them as part of
-- explicit schema rollback.

DROP POLICY IF EXISTS "lrs_runs_tenant_scope" ON "lrs_runs";

DELETE FROM "lrs_runs" WHERE "tenant_id" IS NULL;

ALTER TABLE "lrs_runs" ALTER COLUMN "tenant_id" SET NOT NULL;

CREATE POLICY "lrs_runs_tenant_scope" ON "lrs_runs"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);
