-- Reverses 0004_social_drafts.sql. Hand-written per arch §5.
-- Order: drop policy → disable RLS → drop indexes → drop table (FKs cascade)
-- → drop enums.

DROP POLICY IF EXISTS "social_drafts_tenant_scope" ON "social_drafts";

ALTER TABLE "social_drafts" DISABLE ROW LEVEL SECURITY;

DROP INDEX IF EXISTS "social_drafts_agent_run_idx";
DROP INDEX IF EXISTS "social_drafts_channel_idx";
DROP INDEX IF EXISTS "social_drafts_status_idx";
DROP INDEX IF EXISTS "social_drafts_tenant_idx";

DROP TABLE IF EXISTS "social_drafts";

DROP TYPE IF EXISTS "public"."social_draft_status";
DROP TYPE IF EXISTS "public"."social_channel";
