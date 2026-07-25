-- Reverses 0005_directory_submissions.sql. Hand-written per arch §5.
-- Order: drop policy → disable RLS → drop indexes → drop tables (FKs cascade)
-- → drop enums.

DROP POLICY IF EXISTS "directory_submissions_tenant_scope" ON "directory_submissions";

ALTER TABLE "directory_submissions" DISABLE ROW LEVEL SECURITY;

DROP INDEX IF EXISTS "directory_submissions_agent_run_idx";
DROP INDEX IF EXISTS "directory_submissions_slug_idx";
DROP INDEX IF EXISTS "directory_submissions_status_idx";
DROP INDEX IF EXISTS "directory_submissions_tenant_idx";

DROP TABLE IF EXISTS "directory_submissions";
DROP TABLE IF EXISTS "directory_catalog";

DROP TYPE IF EXISTS "public"."directory_submission_status";
DROP TYPE IF EXISTS "public"."directory_automation_kind";
