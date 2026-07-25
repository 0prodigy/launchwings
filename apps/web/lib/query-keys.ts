/*
 * tenantId-aware react-query key factory.
 *
 * Class-A pre-merge gate from CTO review: every react-query key MUST include
 * tenantId so a stale cache from a tenant-switch (or a misrouted hook) cannot
 * surface another tenant's data. This factory is the canonical place to mint
 * keys for any non-tRPC react-query usage we add (image preview caches,
 * derived view-models, etc.).
 *
 * NOTE on tRPC: `@trpc/react-query` already encodes the procedure path + input
 * into its keys, and the apps/api Clerk middleware enforces tenant scoping
 * server-side per-request, so direct tRPC hook calls don't need to wrap
 * keys through this factory. Use this factory for any vanilla useQuery /
 * useMutation that bypasses tRPC, OR for prefetch keys that have to match.
 *
 * Pattern: every factory takes tenantId as the first arg. If you find
 * yourself calling `productKeys.detail(productId)` without tenantId, that's
 * a bug — fix the call site, do not add an overload.
 *
 * Sourcing tenantId on the web side: read it from a `me` tRPC query (server
 * resolves Clerk session → DB user → tenantId). The Clerk session itself
 * does not expose our DB tenantId, so do not read `useAuth().orgId` and
 * assume it equals tenantId — it does not.
 */

export type TenantId = string;
export type ProductId = string;
export type LrsRunId = string;

const root = (tenantId: TenantId) => ["tenant", tenantId] as const;

export const productKeys = {
  all: (tenantId: TenantId) => [...root(tenantId), "products"] as const,
  list: (tenantId: TenantId) => [...productKeys.all(tenantId), "list"] as const,
  detail: (tenantId: TenantId, productId: ProductId) =>
    [...productKeys.all(tenantId), "detail", productId] as const,
  brief: (tenantId: TenantId, productId: ProductId) =>
    [...productKeys.all(tenantId), "brief", productId] as const,
};

export const lrsKeys = {
  all: (tenantId: TenantId) => [...root(tenantId), "lrs"] as const,
  detail: (tenantId: TenantId, productId: ProductId) =>
    [...lrsKeys.all(tenantId), "detail", productId] as const,
  run: (tenantId: TenantId, runId: LrsRunId) =>
    [...lrsKeys.all(tenantId), "run", runId] as const,
};

export const briefKeys = {
  edits: (tenantId: TenantId, productId: ProductId) =>
    [...root(tenantId), "brief-edits", productId] as const,
};
