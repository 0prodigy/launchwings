-- Reverses 0002_lrs.sql. Hand-written per arch §5.
-- Order matters: drop policies → disable RLS → drop indexes → drop FKs
-- (implicitly via DROP TABLE) → drop tables → drop enums.

DROP POLICY IF EXISTS "lrs_results_via_run_tenant_scope" ON "lrs_results";
DROP POLICY IF EXISTS "lrs_runs_tenant_scope" ON "lrs_runs";

ALTER TABLE "lrs_results" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "lrs_runs"    DISABLE ROW LEVEL SECURITY;

DROP INDEX IF EXISTS "lrs_runs_status_idx";
DROP INDEX IF EXISTS "lrs_runs_tenant_idx";
DROP INDEX IF EXISTS "lrs_results_evaluator_idx";
DROP INDEX IF EXISTS "lrs_results_run_idx";

DROP TABLE IF EXISTS "lrs_results";
DROP TABLE IF EXISTS "lrs_runs";

DROP TYPE IF EXISTS "public"."lrs_run_status";
DROP TYPE IF EXISTS "public"."lrs_result_severity";
