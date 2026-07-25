import { sql } from "drizzle-orm";
import type { DbPool } from "./client-pool";

// Helper that wraps a callback in a transaction with `SET LOCAL app.tenant_id`,
// so RLS policies fire correctly. Hono middleware should call this for any
// procedure that touches tenant-scoped tables.
//
// IMPORTANT: must run on dbPool (transaction-capable) — calling on the HTTP
// driver silently no-ops the SET LOCAL (R3 in docs/architecture/SETUP-01-monorepo-design.md §13).

export async function withTenant<T>(
  db: DbPool,
  tenantId: string,
  fn: (tx: DbPool) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // Postgres SET LOCAL does not accept bind parameters, so we use the
    // set_config() function form. The third arg (`true`) scopes the setting
    // to the current transaction, matching SET LOCAL semantics.
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx as unknown as DbPool);
  });
}
