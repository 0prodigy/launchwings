-- Row-level security bootstrap. Layered after 0000 so tables exist.
-- Per arch §5: every multi-tenant table gets `tenant_id uuid NOT NULL` (the
-- schema enforces NOT NULL except on audit_log, which can record system
-- actions) plus a `current_setting('app.tenant_id')`-derived USING policy.
--
-- Hono middleware wraps each request in a transaction with `SET LOCAL
-- app.tenant_id = $1` (see packages/db/src/tenant-scope.ts withTenant).
-- WITHOUT a transaction, SET LOCAL is a no-op — the HTTP/serverless driver
-- must NOT be used for tenant-scoped writes (R3 in arch §13).

ALTER TABLE "tenants"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agent_runs"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log"   ENABLE ROW LEVEL SECURITY;

-- Tenant table itself: a session can only see its own tenant row.
CREATE POLICY "tenants_self_only" ON "tenants"
  USING ("id" = current_setting('app.tenant_id', true)::uuid);

-- Per-table tenant scope. `true` (missing-ok) lets us run the migrator and
-- one-off admin scripts when the GUC is unset; in that case the policy
-- evaluates to NULL and the row is hidden. Set `app.tenant_id` to the
-- caller's tenant before any read/write.
CREATE POLICY "users_tenant_scope" ON "users"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY "products_tenant_scope" ON "products"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY "agent_runs_tenant_scope" ON "agent_runs"
  USING ("tenant_id" = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY "audit_log_tenant_scope" ON "audit_log"
  USING (
    "tenant_id" IS NULL OR
    "tenant_id" = current_setting('app.tenant_id', true)::uuid
  );

-- waitlist is intentionally NOT tenant-scoped — it is the pre-account capture
-- surface. RLS stays disabled on waitlist; access control is at the API layer.
