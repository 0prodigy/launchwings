-- Build-Platform Integration PR1 — Level 1 (URL/HTML/header detection +
-- per-audit tagging dataset).
--
-- Per docs/architecture/BUILD_PLATFORM_INTEGRATIONS.md §"Data model
-- additions": this migration ships the trimmed-for-PR1 cut. Level 2/3
-- (per-tenant connections + imported_projects) are explicitly out of
-- scope — they need partner OAuth / API conversation; PR2/PR3 wire them.
--
-- Note on chain-repair: this migration fixes a pre-existing meta/journal
-- inconsistency where 0006_insight_briefs's prevId pointed at 0004 rather
-- than 0005, causing drizzle-kit's snapshot collision check to fail.
-- 0006_snapshot.json's prevId was repaired to 32ad5658-... (0005's id)
-- here so `pnpm --filter @launchwings/db db:generate` runs clean.
--
-- Tables added:
--   build_platforms                       reference data (no RLS)
--   product_build_platform_detections     tenant-scoped, anonymous-ok RLS

CREATE TYPE "public"."build_platform_id" AS ENUM('lovable', 'bolt', 'v0', 'replit', 'cursor', 'paperclip', 'pickaxe', 'tempolabs', 'softgen', 'create-xyz');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "build_platforms" (
	"id" "build_platform_id" PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"home_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_build_platform_detections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"product_url" text NOT NULL,
	"platform" "build_platform_id",
	"confidence" integer NOT NULL,
	"signals_json" jsonb NOT NULL,
	"lrs_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_build_platform_detections" ADD CONSTRAINT "product_build_platform_detections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_build_platform_detections" ADD CONSTRAINT "product_build_platform_detections_lrs_run_id_lrs_runs_id_fk" FOREIGN KEY ("lrs_run_id") REFERENCES "public"."lrs_runs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_build_platform_detections_tenant_idx" ON "product_build_platform_detections" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_build_platform_detections_product_url_idx" ON "product_build_platform_detections" USING btree ("product_url");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_build_platform_detections_platform_idx" ON "product_build_platform_detections" USING btree ("platform");--> statement-breakpoint
-- RLS for product_build_platform_detections — mirrors the lrs_runs pattern
-- from 0003_anon_lrs.sql: anonymous /audit demo runs have tenant_id = NULL
-- and their detection rows are visible to every authenticated session AND
-- to the unscoped HTTP serverless caller. Authenticated callers see only
-- their own tenant's rows.
--
-- build_platforms is reference data — no RLS, no tenant_id column.
ALTER TABLE "product_build_platform_detections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "product_build_platform_detections_tenant_scope" ON "product_build_platform_detections"
  USING (
    "tenant_id" IS NULL OR
    "tenant_id" = current_setting('app.tenant_id', true)::uuid
  );
