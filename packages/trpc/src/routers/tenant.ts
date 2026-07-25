import { eq } from "drizzle-orm";
import { dbPool, tenants, withTenant } from "@launchwings/db";
import { protectedProcedure, router } from "../trpc";

// Tenant-scoped router. Uses `withTenant` so every query runs inside a
// transaction with `SET LOCAL app.tenant_id = ...` — that's what makes the
// RLS policies in packages/db/src/schema.ts actually fire (R3 in
// docs/architecture/SETUP-01-monorepo-design.md §13).
//
// `tenantCheck` is the cross-tenant integration target: read the current
// tenant's slug. Combined with the test in apps/api/src/__tests__, it proves
// User-A's session cannot see Tenant-B's rows.
export const tenantRouter = router({
  tenantCheck: protectedProcedure.query(async ({ ctx }) => {
    const db = dbPool();
    return withTenant(db, ctx.tenantId, async (tx) => {
      const rows = await tx
        .select({ id: tenants.id, slug: tenants.slug, name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, ctx.tenantId))
        .limit(1);

      const row = rows[0];
      // Under RLS, this lookup either returns the caller's tenant row or none.
      // None is the cross-tenant-leak signal — but it should be unreachable
      // because `protectedProcedure` already guarantees ctx.tenantId is theirs.
      return {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        slug: row?.slug ?? null,
        name: row?.name ?? null,
        rlsApplied: true as const,
      };
    });
  }),
});
