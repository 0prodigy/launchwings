import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { schema } from "./schema";
import { requireUrl } from "./env";

// HTTP / serverless client. Use this from RSC, route handlers, server actions —
// anywhere short reads happen on Vercel functions where transactions are not
// available. Per arch §5: tenant-scoped writes MUST go through dbPool because
// `SET LOCAL app.tenant_id` is silently a no-op without a transaction (R3).

let _client: ReturnType<typeof drizzle> | null = null;

export function dbHttp() {
  if (_client) return _client;
  const sql = neon(requireUrl());
  _client = drizzle(sql, { schema });
  return _client;
}

export type DbHttp = ReturnType<typeof dbHttp>;
