import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { schema } from "./schema";
import { requirePooledUrl } from "./env";

// Pooled / node-postgres client for Fly.io's long-lived process. Use this for
// every tenant-scoped write — RLS depends on `SET LOCAL app.tenant_id` inside
// a transaction, which the HTTP driver cannot guarantee (R3 in arch §13).
//
// Pool sized small intentionally: Neon's free tier has tight connection limits;
// we want a back-pressure signal in CI rather than a midnight outage.

let _pool: pg.Pool | null = null;
let _client: ReturnType<typeof drizzle> | null = null;

export function dbPool() {
  if (_client) return _client;
  _pool = new pg.Pool({
    connectionString: requirePooledUrl(),
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  _pool.on("error", (err) => {
    console.error(JSON.stringify({ level: "error", source: "pg-pool", message: err.message }));
  });
  _client = drizzle(_pool, { schema });
  return _client;
}

export function rawPool(): pg.Pool {
  if (!_pool) {
    // Create lazily but don't double-initialise the drizzle client.
    dbPool();
  }
  return _pool!;
}

export async function closePool() {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _client = null;
  }
}

export type DbPool = ReturnType<typeof dbPool>;
