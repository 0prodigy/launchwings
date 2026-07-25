CREATE TYPE "public"."social_channel" AS ENUM('x', 'linkedin', 'reddit', 'bluesky', 'threads');--> statement-breakpoint
CREATE TYPE "public"."social_draft_status" AS ENUM('draft', 'approved', 'scheduled', 'posted', 'rejected');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "social_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"agent_run_id" uuid,
	"channel" "social_channel" NOT NULL,
	"body_md" text NOT NULL,
	"body_char_count" integer NOT NULL,
	"status" "social_draft_status" DEFAULT 'draft' NOT NULL,
	"posted_url" text,
	"posted_at" timestamp with time zone,
	"metadata_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Note: drizzle-kit's snapshot diff also surfaced an ALTER COLUMN on
-- lrs_runs.tenant_id; that change already shipped in 0003_anon_lrs.sql, so it's
-- intentionally elided here to keep this migration scoped to social_drafts.
DO $$ BEGIN
 ALTER TABLE "social_drafts" ADD CONSTRAINT "social_drafts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "social_drafts" ADD CONSTRAINT "social_drafts_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_drafts_tenant_idx" ON "social_drafts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_drafts_status_idx" ON "social_drafts" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_drafts_channel_idx" ON "social_drafts" USING btree ("channel");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "social_drafts_agent_run_idx" ON "social_drafts" USING btree ("agent_run_id");--> statement-breakpoint
-- F2 PR1 — RLS for social_drafts. Mirrors products_tenant_scope: strict tenant
-- isolation (NO null-tenant fallback unlike lrs_runs) since drafts always come
-- from a logged-in founder.
ALTER TABLE "social_drafts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "social_drafts_tenant_scope" ON "social_drafts"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);