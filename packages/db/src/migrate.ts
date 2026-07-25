import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { requirePooledUrl } from "./env";

// One-shot migrator. Called from `pnpm db:migrate` and from CI.
// Runs all up.sql files in migrations/ in lexicographic order.
// Reversible-down is by hand per arch §5; the round-trip test runs `up→down→up`
// in CI on a Neon branch (lands in SETUP-07).

async function run() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const migrationsFolder = resolve(__dirname, "../migrations");
  const pool = new pg.Pool({ connectionString: requirePooledUrl(), max: 1 });
  const db = drizzle(pool);
  console.log(`[db:migrate] applying migrations from ${migrationsFolder}`);
  await migrate(db, { migrationsFolder });
  await pool.end();
  console.log("[db:migrate] done");
}

run().catch((err) => {
  console.error("[db:migrate] failed", err);
  process.exit(1);
});
