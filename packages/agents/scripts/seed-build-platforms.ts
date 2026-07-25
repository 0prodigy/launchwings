// Build-Platform Integration PR1 — build_platforms seed script.
//
// Upserts the partner directory into the build_platforms table. Idempotent:
// ON CONFLICT (id) DO UPDATE refreshes name + home_url on every run, but
// deliberately leaves `status` alone so ops can flip 'planned' → 'partner'
// without a code redeploy turning it back. To force a status change, edit
// SEED_ENTRIES below AND coordinate with ops (or open a follow-up).
//
// Usage:
//   pnpm --filter @launchwings/agents seed-build-platforms
//
// The 10 entries match the build_platform_id pgEnum in
// `packages/db/src/schema.ts`. The detection vocabulary
// (`packages/lrs/src/detect/build-platform.ts`) emits seven of them today;
// the remaining three (tempolabs / softgen / create-xyz) ship as 'planned'
// catalog rows so a future detection rule can tag them without a migration.
//
// Per docs/architecture/BUILD_PLATFORM_INTEGRATIONS.md "Target partners"
// priority order. Status defaults to 'planned' across the board for PR1 —
// no signed partnerships yet. Ops will flip the row when a partnership
// closes (per the order-of-operations table: Lovable + Bolt by end Q1).

import { dbPool, buildPlatforms } from "@launchwings/db";

function logJson(line: Record<string, unknown>): void {
  console.log(JSON.stringify({ source: "seed-build-platforms", ...line }));
}

type SeedEntry = {
  id:
    | "lovable"
    | "bolt"
    | "v0"
    | "replit"
    | "cursor"
    | "paperclip"
    | "pickaxe"
    | "tempolabs"
    | "softgen"
    | "create-xyz";
  name: string;
  status: "partner" | "community" | "planned";
  homeUrl: string;
};

const SEED_ENTRIES: SeedEntry[] = [
  { id: "lovable", name: "Lovable", status: "planned", homeUrl: "https://lovable.dev" },
  { id: "bolt", name: "Bolt.new", status: "planned", homeUrl: "https://bolt.new" },
  { id: "v0", name: "v0 by Vercel", status: "planned", homeUrl: "https://v0.app" },
  { id: "replit", name: "Replit", status: "planned", homeUrl: "https://replit.com" },
  { id: "cursor", name: "Cursor", status: "planned", homeUrl: "https://cursor.com" },
  { id: "paperclip", name: "Paperclip", status: "planned", homeUrl: "https://paperclip.app" },
  { id: "pickaxe", name: "Pickaxe", status: "planned", homeUrl: "https://pickaxe.co" },
  { id: "tempolabs", name: "Tempo Labs", status: "planned", homeUrl: "https://tempolabs.ai" },
  { id: "softgen", name: "Softgen", status: "planned", homeUrl: "https://softgen.ai" },
  { id: "create-xyz", name: "Create.xyz", status: "planned", homeUrl: "https://create.xyz" },
];

async function main(): Promise<void> {
  const db = dbPool();
  let synced = 0;

  for (const entry of SEED_ENTRIES) {
    const result = await db
      .insert(buildPlatforms)
      .values({
        id: entry.id,
        name: entry.name,
        status: entry.status,
        homeUrl: entry.homeUrl,
      })
      .onConflictDoUpdate({
        target: buildPlatforms.id,
        set: {
          name: entry.name,
          homeUrl: entry.homeUrl,
          // Deliberately NOT touching `status` — ops flips 'planned' →
          // 'partner' / 'community' without a code redeploy reverting it.
        },
      })
      .returning({ id: buildPlatforms.id });

    if (result[0]) synced += 1;
  }

  logJson({
    level: "info",
    message: "seed_build_platforms_done",
    synced,
    total: SEED_ENTRIES.length,
  });
}

main().then(
  () => {
    process.exit(0);
  },
  (err) => {
    logJson({
      level: "error",
      message: "seed_build_platforms_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  },
);
