// F2 PR1 — directory_catalog seed script.
//
// Upserts the in-code DIRECTORY_CATALOG into the directory_catalog table.
// Idempotent: ON CONFLICT (slug) DO UPDATE so re-runs in CI re-sync prod
// without losing per-directory `enabled` overrides set by ops (we explicitly
// do NOT overwrite `enabled` — only the catalog metadata fields). If you want
// to forcibly re-enable a directory, set `enabled: true` in catalog.ts and
// add an explicit ALTER manually; or run with `--force-enabled` (not yet
// implemented — file a follow-up if ops needs it).
//
// Usage:
//   pnpm --filter @launchwings/agents seed-directory-catalog
//
// In CI we run this on every deploy so a catalog edit ships with the code.
//
// Note on the dbHttp/dbPool choice: directory_catalog is NOT tenant-scoped
// (RLS disabled), so we don't need withTenant. We use dbPool here anyway —
// the script may run in a long-lived shell, and dbPool's pg.Pool is the
// standard surface. Either driver would work.

import { dbPool, directoryCatalog } from "@launchwings/db";
import { sql } from "drizzle-orm";
import { DIRECTORY_CATALOG } from "../src/directories/catalog";

function logJson(line: Record<string, unknown>): void {
  console.log(JSON.stringify({ source: "seed-directory-catalog", ...line }));
}

async function main(): Promise<void> {
  const db = dbPool();
  let inserted = 0;
  let updated = 0;

  for (const entry of DIRECTORY_CATALOG) {
    const result = await db
      .insert(directoryCatalog)
      .values({
        slug: entry.slug,
        name: entry.name,
        submissionUrl: entry.submissionUrl,
        automationKind: entry.automationKind,
        category: entry.category,
        instructionsMd: entry.instructionsMd ?? null,
        fieldSchemaJson: entry.fieldSchemaJson as unknown as Record<string, unknown>,
        notes: entry.notes ?? null,
        enabled: entry.enabled,
      })
      .onConflictDoUpdate({
        target: directoryCatalog.slug,
        set: {
          name: entry.name,
          submissionUrl: entry.submissionUrl,
          automationKind: entry.automationKind,
          category: entry.category,
          instructionsMd: entry.instructionsMd ?? null,
          fieldSchemaJson: entry.fieldSchemaJson as unknown as Record<string, unknown>,
          notes: entry.notes ?? null,
          // Deliberately NOT touching `enabled` — ops can disable a directory
          // (e.g. when it goes down) without our code redeploy turning it back on.
          updatedAt: sql`now()`,
        },
      })
      .returning({ slug: directoryCatalog.slug });

    if (result[0]) {
      // Drizzle doesn't surface "was this an insert or an update" cleanly
      // across drivers. Simplest signal: count both as "synced".
      inserted += 1;
    }
    void updated;
  }

  logJson({
    level: "info",
    message: "seed_directory_catalog_done",
    synced: inserted,
    total: DIRECTORY_CATALOG.length,
  });
}

main().then(
  () => {
    process.exit(0);
  },
  (err) => {
    logJson({
      level: "error",
      message: "seed_directory_catalog_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  },
);
