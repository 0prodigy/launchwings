-- Reverses 0001_rls.sql.

DROP POLICY IF EXISTS "audit_log_tenant_scope" ON "audit_log";
DROP POLICY IF EXISTS "agent_runs_tenant_scope" ON "agent_runs";
DROP POLICY IF EXISTS "products_tenant_scope" ON "products";
DROP POLICY IF EXISTS "users_tenant_scope" ON "users";
DROP POLICY IF EXISTS "tenants_self_only" ON "tenants";

ALTER TABLE "audit_log"   DISABLE ROW LEVEL SECURITY;
ALTER TABLE "agent_runs"  DISABLE ROW LEVEL SECURITY;
ALTER TABLE "products"    DISABLE ROW LEVEL SECURITY;
ALTER TABLE "users"       DISABLE ROW LEVEL SECURITY;
ALTER TABLE "tenants"     DISABLE ROW LEVEL SECURITY;
