-- LRC-01 PR6 — anonymous audit runs.
--
-- The /audit demo on apps/web runs without auth; we still want to persist a
-- shareable record of each audit (one row in lrs_runs + one row per evaluator
-- in lrs_results) so users can hand out a permalink. Anonymous rows have
-- tenant_id = NULL.
--
-- This mirrors the audit_log_tenant_scope pattern from 0001_rls.sql:
-- `tenant_id IS NULL OR tenant_id = current_setting(...)`. Authenticated
-- callers (Hono request scope, withTenant) still see only their own tenant's
-- rows. Anonymous rows are visible to every authenticated session AND to the
-- unscoped HTTP serverless caller — that is intentional, the demo permalink
-- is public-by-design.
--
-- lrs_results' RLS uses a subquery on lrs_runs; that policy inherits the new
-- behavior (the subquery returns the matching lrs_runs rows under the new
-- USING clause), so we don't need to alter lrs_results.

ALTER TABLE "lrs_runs" ALTER COLUMN "tenant_id" DROP NOT NULL;

DROP POLICY IF EXISTS "lrs_runs_tenant_scope" ON "lrs_runs";

CREATE POLICY "lrs_runs_tenant_scope" ON "lrs_runs"
  USING (
    "tenant_id" IS NULL OR
    "tenant_id" = current_setting('app.tenant_id', true)::uuid
  );
