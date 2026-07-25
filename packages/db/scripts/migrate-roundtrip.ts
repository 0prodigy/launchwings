// migrate-roundtrip.ts — SETUP-07 round-trip test for reversible migrations.
//
// Every migration in packages/db/migrations/ ships with a hand-written
// `*.down.sql` (arch §5). This script asserts the pair is genuinely reversible
// by exercising up → down → up against a real Postgres (CI runs it on a
// throwaway Neon branch via .github/workflows/setup-07-neon-branch-pr.yml).
//
// Algorithm:
//   1. Snapshot schema (hash of (schema, table, column, ordinal_position,
//      data_type, is_nullable, column_default)).
//   2. Apply every `<n>_*.sql` in lexicographic order ("up #1").
//   3. Apply every `<n>_*.down.sql` in REVERSE lexicographic order.
//   4. Apply every `<n>_*.sql` again ("up #2").
//   5. Snapshot schema again. Assert hash equality.
//
// We deliberately do NOT compare drizzle's `__drizzle_migrations` bookkeeping
// table — `pnpm db:migrate` may have populated it on the first up but the
// roundtrip we care about is the user-defined schema.
//
// Bails non-zero on any divergence; prints both hashes and a diff hint.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = resolve(__dirname, "../migrations");

function log(msg: string, extra?: Record<string, unknown>) {
  const line = extra
    ? `[migrate-roundtrip] ${msg} ${JSON.stringify(extra)}`
    : `[migrate-roundtrip] ${msg}`;
  console.log(line);
}

function listMigrations(): { ups: string[]; downs: string[] } {
  const all = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
  const downs = all.filter((f) => f.endsWith(".down.sql")).sort();
  const ups = all.filter((f) => !f.endsWith(".down.sql")).sort();
  // Sanity: every up must have a sibling down.
  for (const up of ups) {
    const expected = up.replace(/\.sql$/, ".down.sql");
    if (!downs.includes(expected)) {
      throw new Error(
        `Missing down migration for ${up}. Expected ${expected} (arch §5: every migration is hand-reversible).`,
      );
    }
  }
  return { ups, downs };
}

async function applyFile(client: pg.PoolClient, file: string) {
  const path = resolve(migrationsDir, file);
  const raw = readFileSync(path, "utf8");
  // drizzle-kit emits `--> statement-breakpoint` markers between statements.
  // Strip them and let the driver execute the (possibly multi-statement)
  // string as a single batch — matches what drizzle's migrator does.
  const sql = raw.replace(/-->\s*statement-breakpoint/g, "");
  log(`apply ${file}`);
  await client.query(sql);
}

async function snapshotSchema(client: pg.PoolClient): Promise<string> {
  // Compare user schema only — exclude drizzle bookkeeping and pg internals.
  const cols = await client.query<{
    table_schema: string;
    table_name: string;
    column_name: string;
    ordinal_position: number;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
  }>(`
    SELECT table_schema, table_name, column_name, ordinal_position,
           data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      AND table_name <> '__drizzle_migrations'
    ORDER BY table_schema, table_name, ordinal_position
  `);

  const tables = await client.query<{
    table_schema: string;
    table_name: string;
    table_type: string;
  }>(`
    SELECT table_schema, table_name, table_type
    FROM information_schema.tables
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      AND table_name <> '__drizzle_migrations'
    ORDER BY table_schema, table_name
  `);

  const policies = await client.query<{
    schemaname: string;
    tablename: string;
    policyname: string;
    permissive: string;
    cmd: string;
    qual: string | null;
  }>(`
    SELECT schemaname, tablename, policyname, permissive, cmd, qual
    FROM pg_policies
    ORDER BY schemaname, tablename, policyname
  `);

  const enums = await client.query<{
    type_name: string;
    label: string;
    sortorder: number;
  }>(`
    SELECT t.typname AS type_name, e.enumlabel AS label, e.enumsortorder AS sortorder
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    ORDER BY t.typname, e.enumsortorder
  `);

  const payload = JSON.stringify({
    tables: tables.rows,
    columns: cols.rows,
    policies: policies.rows,
    enums: enums.rows,
  });

  return createHash("sha256").update(payload).digest("hex");
}

async function main() {
  const url = process.env.DATABASE_URL ?? process.env.DATABASE_URL_POOLED;
  if (!url) {
    console.error(
      "[migrate-roundtrip] DATABASE_URL not set. Point this at a throwaway Neon branch.",
    );
    process.exit(1);
  }

  const { ups, downs } = listMigrations();
  log(`discovered ${ups.length} migration pair(s)`, { ups, downs });

  const pool = new pg.Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  try {
    const empty = await snapshotSchema(client);
    log("baseline (pre-up) hash", { hash: empty });

    // Up #1
    for (const f of ups) await applyFile(client, f);
    const afterUp1 = await snapshotSchema(client);
    log("after up #1", { hash: afterUp1 });

    // Down (reverse lex order — newest first)
    for (const f of [...downs].reverse()) await applyFile(client, f);
    const afterDown = await snapshotSchema(client);
    log("after down", { hash: afterDown });

    if (afterDown !== empty) {
      console.error(
        "[migrate-roundtrip] FAIL: schema after down does not match pre-up baseline",
      );
      console.error(`  baseline:   ${empty}`);
      console.error(`  after down: ${afterDown}`);
      console.error(
        "  Hint: a *.down.sql is missing a DROP, or order in the down file is wrong.",
      );
      process.exit(2);
    }

    // Up #2
    for (const f of ups) await applyFile(client, f);
    const afterUp2 = await snapshotSchema(client);
    log("after up #2", { hash: afterUp2 });

    if (afterUp2 !== afterUp1) {
      console.error(
        "[migrate-roundtrip] FAIL: re-applying up after down produced a different schema",
      );
      console.error(`  after up #1: ${afterUp1}`);
      console.error(`  after up #2: ${afterUp2}`);
      process.exit(3);
    }

    log("OK — up→down→up is idempotent");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[migrate-roundtrip] unexpected error", err);
  process.exit(1);
});
