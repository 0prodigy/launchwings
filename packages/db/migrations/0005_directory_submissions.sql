CREATE TYPE "public"."directory_automation_kind" AS ENUM('api', 'browser_form', 'manual');--> statement-breakpoint
CREATE TYPE "public"."directory_submission_status" AS ENUM('draft', 'queued', 'in_progress', 'submitted', 'rejected', 'needs_manual');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "directory_catalog" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"submission_url" text NOT NULL,
	"automation_kind" "directory_automation_kind" NOT NULL,
	"category" text NOT NULL,
	"instructions_md" text,
	"field_schema_json" jsonb NOT NULL,
	"notes" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "directory_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"agent_run_id" uuid,
	"directory_slug" text NOT NULL,
	"directory_name" text NOT NULL,
	"directory_url" text NOT NULL,
	"automation_kind" "directory_automation_kind" NOT NULL,
	"status" "directory_submission_status" DEFAULT 'draft' NOT NULL,
	"payload_json" jsonb NOT NULL,
	"submitted_url" text,
	"submitted_at" timestamp with time zone,
	"reject_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "directory_submissions" ADD CONSTRAINT "directory_submissions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "directory_submissions" ADD CONSTRAINT "directory_submissions_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "directory_submissions_tenant_idx" ON "directory_submissions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "directory_submissions_status_idx" ON "directory_submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "directory_submissions_slug_idx" ON "directory_submissions" USING btree ("directory_slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "directory_submissions_agent_run_idx" ON "directory_submissions" USING btree ("agent_run_id");--> statement-breakpoint
-- F2 PR1 — RLS for directory_submissions. Mirrors social_drafts_tenant_scope:
-- strict tenant isolation, no anonymous fallback. directory_catalog is
-- intentionally NOT RLS-enabled — it is reference data shared across all
-- tenants (every founder sees the same catalog of launch directories).
ALTER TABLE "directory_submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "directory_submissions_tenant_scope" ON "directory_submissions"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);