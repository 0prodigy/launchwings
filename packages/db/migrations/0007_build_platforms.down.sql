-- Reverses 0007_build_platforms.sql. Hand-written per arch §5.
-- Order: drop policy → disable RLS → drop indexes → drop tables → drop FKs cascade → drop enum.

DROP POLICY IF EXISTS "product_build_platform_detections_tenant_scope" ON "product_build_platform_detections";

ALTER TABLE IF EXISTS "product_build_platform_detections" DISABLE ROW LEVEL SECURITY;

DROP INDEX IF EXISTS "product_build_platform_detections_platform_idx";
DROP INDEX IF EXISTS "product_build_platform_detections_product_url_idx";
DROP INDEX IF EXISTS "product_build_platform_detections_tenant_idx";

DROP TABLE IF EXISTS "product_build_platform_detections";
DROP TABLE IF EXISTS "build_platforms";

DROP TYPE IF EXISTS "public"."build_platform_id";
