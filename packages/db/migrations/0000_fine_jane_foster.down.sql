-- Reverses 0000_fine_jane_foster.sql. Hand-written per arch §5.
-- Order matters: drop dependent objects (tables with FKs) before referents.

DROP INDEX IF EXISTS "agent_runs_status_idx";
DROP INDEX IF EXISTS "agent_runs_trigger_run_id_uq";
DROP INDEX IF EXISTS "agent_runs_tenant_idx";
DROP INDEX IF EXISTS "audit_log_created_at_idx";
DROP INDEX IF EXISTS "audit_log_actor_idx";
DROP INDEX IF EXISTS "audit_log_tenant_idx";
DROP INDEX IF EXISTS "products_tenant_idx";
DROP INDEX IF EXISTS "users_tenant_idx";
DROP INDEX IF EXISTS "users_clerk_user_id_uq";
DROP INDEX IF EXISTS "tenants_slug_uq";
DROP INDEX IF EXISTS "waitlist_created_at_idx";
DROP INDEX IF EXISTS "waitlist_email_uq";

DROP TABLE IF EXISTS "agent_runs";
DROP TABLE IF EXISTS "audit_log";
DROP TABLE IF EXISTS "products";
DROP TABLE IF EXISTS "users";
DROP TABLE IF EXISTS "waitlist";
DROP TABLE IF EXISTS "tenants";

DROP TYPE IF EXISTS "public"."agent_run_status";
