-- Reverses 0006_insight_briefs.sql. Hand-written per arch §5.
-- Order: drop policy → disable RLS → drop indexes → drop table (FKs cascade).

DROP POLICY IF EXISTS "insight_daily_briefs_tenant_scope" ON "insight_daily_briefs";

ALTER TABLE "insight_daily_briefs" DISABLE ROW LEVEL SECURITY;

DROP INDEX IF EXISTS "insight_daily_briefs_brief_for_idx";
DROP INDEX IF EXISTS "insight_daily_briefs_tenant_idx";
DROP INDEX IF EXISTS "insight_daily_briefs_tenant_day_uq";

DROP TABLE IF EXISTS "insight_daily_briefs";
