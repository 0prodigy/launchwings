/**
 * SETUP-03 cross-tenant isolation check.
 *
 * Runs the tRPC `tenantCheck` procedure as User-A and asserts (a) it returns
 * Tenant-A's slug, and (b) reading Tenant-B's `products` rows from User-A's
 * tenant scope returns 0 — i.e. RLS, not application filtering, is blocking
 * the leak (R3 in docs/architecture/SETUP-01-monorepo-design.md §13).
 *
 * Skip-if-no-DB: when DATABASE_URL/_POOLED is unset, log "skipping" and exit 0
 * so CI doesn't break on machines without a Neon dev branch attached.
 *
 * Run with: pnpm --filter @launchwings/api exec tsx scripts/tenant-isolation-check.ts
 */

import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import {
  closePool,
  dbPool,
  products,
  tenants,
  users,
  withTenant,
} from "@launchwings/db";
import { appRouter } from "@launchwings/trpc/router";

function log(level: "info" | "warn" | "error", message: string, extra?: Record<string, unknown>) {
  console.log(JSON.stringify({ level, source: "tenant-iso-check", message, ...(extra ?? {}) }));
}

async function main() {
  if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_POOLED) {
    log("info", "DATABASE_URL not set — skipping tenant isolation check");
    process.exit(0);
  }

  const db = dbPool();

  // Unique slugs so re-runs against the same DB don't collide with old rows.
  const runTag = randomUUID().slice(0, 8);
  const slugA = `iso-a-${runTag}`;
  const slugB = `iso-b-${runTag}`;

  // Seed two tenants + two users + one product per tenant.
  const [tenantA] = await db
    .insert(tenants)
    .values({ slug: slugA, name: `Tenant A ${runTag}` })
    .returning({ id: tenants.id, slug: tenants.slug });
  const [tenantB] = await db
    .insert(tenants)
    .values({ slug: slugB, name: `Tenant B ${runTag}` })
    .returning({ id: tenants.id, slug: tenants.slug });

  if (!tenantA || !tenantB) throw new Error("seed failed: missing tenant rows");

  const [userA] = await db
    .insert(users)
    .values({
      tenantId: tenantA.id,
      clerkUserId: `clerk_user_a_${runTag}`,
      email: `a+${runTag}@example.com`,
    })
    .returning({ id: users.id });
  const [userB] = await db
    .insert(users)
    .values({
      tenantId: tenantB.id,
      clerkUserId: `clerk_user_b_${runTag}`,
      email: `b+${runTag}@example.com`,
    })
    .returning({ id: users.id });

  if (!userA || !userB) throw new Error("seed failed: missing user rows");

  await db.insert(products).values({ tenantId: tenantA.id, name: "A's product" });
  await db.insert(products).values({ tenantId: tenantB.id, name: "B's product" });

  log("info", "seeded test tenants", { tenantA: tenantA.id, tenantB: tenantB.id });

  // Build the tRPC server-side caller as User-A. createCaller skips HTTP and
  // executes procedures directly with a synthetic context — same execution
  // path as a real request once createContext returns.
  const callerA = appRouter.createCaller({
    requestId: `iso-${runTag}`,
    tenantId: tenantA.id,
    userId: userA.id,
  });

  // Assertion 1: tenantCheck returns Tenant-A's slug.
  const checked = await callerA.tenant.tenantCheck();
  if (checked.tenantId !== tenantA.id || checked.slug !== slugA) {
    throw new Error(
      `tenantCheck returned wrong tenant: got tenantId=${checked.tenantId} slug=${checked.slug}`,
    );
  }
  log("info", "assert OK: tenantCheck returned own tenant", checked);

  // Assertion 2: reading Tenant-B's products from inside Tenant-A's scope
  // returns 0 — by RLS, not by an application-level WHERE clause. We use
  // raw count so a missing WHERE wouldn't accidentally pass.
  const leakCount = await withTenant(db, tenantA.id, async (tx) => {
    const result = await tx.execute<{ count: string }>(
      sql`SELECT COUNT(*)::text AS count FROM products WHERE tenant_id = ${tenantB.id}`,
    );
    const row = (result.rows ?? (result as unknown as { rows?: Array<{ count: string }> }).rows)?.[0];
    return Number.parseInt(row?.count ?? "0", 10);
  });
  if (leakCount !== 0) {
    throw new Error(
      `RLS leak: User-A's scope sees ${leakCount} of Tenant-B's products (expected 0).`,
    );
  }
  log("info", "assert OK: cross-tenant product read returned 0 rows");

  // Cleanup. ON DELETE CASCADE clears users + products via tenants FK.
  await db.delete(tenants).where(eq(tenants.id, tenantA.id));
  await db.delete(tenants).where(eq(tenants.id, tenantB.id));
  log("info", "cleanup complete");

  await closePool();
  log("info", "tenant isolation check PASS");
}

main().catch(async (err) => {
  log("error", "tenant isolation check FAIL", {
    error: err instanceof Error ? err.message : String(err),
  });
  await closePool().catch(() => {});
  process.exit(1);
});
