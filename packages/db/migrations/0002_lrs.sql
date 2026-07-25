CREATE TYPE "public"."lrs_result_severity" AS ENUM('pass', 'warn', 'fail');--> statement-breakpoint
CREATE TYPE "public"."lrs_run_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lrs_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"evaluator_id" text NOT NULL,
	"severity" "lrs_result_severity" NOT NULL,
	"score" integer NOT NULL,
	"evidence_json" jsonb,
	"fix_action_markdown" text,
	"latency_ms" integer,
	"cost_usd_micros" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lrs_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"target_url" text NOT NULL,
	"status" "lrs_run_status" DEFAULT 'running' NOT NULL,
	"summary_json" jsonb,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lrs_results" ADD CONSTRAINT "lrs_results_run_id_lrs_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."lrs_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lrs_runs" ADD CONSTRAINT "lrs_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lrs_results_run_idx" ON "lrs_results" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lrs_results_evaluator_idx" ON "lrs_results" USING btree ("evaluator_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lrs_runs_tenant_idx" ON "lrs_runs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lrs_runs_status_idx" ON "lrs_runs" USING btree ("status");--> statement-breakpoint
-- RLS for the LRC-01 tables. Mirrors 0001_rls.sql's policy model: every
-- multi-tenant row is gated by `current_setting('app.tenant_id')`. lrs_results
-- inherits its scope by joining lrs_runs (no direct tenant_id column) so we
-- query through the parent.
ALTER TABLE "lrs_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lrs_results" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "lrs_runs_tenant_scope" ON "lrs_runs"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "lrs_results_via_run_tenant_scope" ON "lrs_results"
  USING (
    "run_id" IN (
      SELECT "id" FROM "lrs_runs"
      WHERE "tenant_id" = current_setting('app.tenant_id', true)::uuid
    )
  );