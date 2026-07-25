CREATE TABLE IF NOT EXISTS "insight_daily_briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"agent_run_id" uuid,
	"brief_for" date NOT NULL,
	"headline" text NOT NULL,
	"recommendation_md" text NOT NULL,
	"kpis_json" jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "insight_daily_briefs" ADD CONSTRAINT "insight_daily_briefs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "insight_daily_briefs" ADD CONSTRAINT "insight_daily_briefs_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "insight_daily_briefs_tenant_day_uq" ON "insight_daily_briefs" USING btree ("tenant_id","brief_for");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "insight_daily_briefs_tenant_idx" ON "insight_daily_briefs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "insight_daily_briefs_brief_for_idx" ON "insight_daily_briefs" USING btree ("brief_for");--> statement-breakpoint
-- F2 PR2 — RLS for insight_daily_briefs. Mirrors social_drafts_tenant_scope:
-- strict tenant isolation (NO null-tenant fallback) since briefs are always
-- for a specific tenant.
ALTER TABLE "insight_daily_briefs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "insight_daily_briefs_tenant_scope" ON "insight_daily_briefs"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);