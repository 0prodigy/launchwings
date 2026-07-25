import { schedules } from "@trigger.dev/sdk";
import { sql } from "drizzle-orm";
import { dbPool, products } from "@launchwings/db";
import { auditTarget } from "../tasks/audit-target";

// LRC-01 — 07:00 UTC daily LRS re-audit fan-out for active launches.
//
// "Active" here means the founder onboarded past the Discovery step
// (products.metadata.discovery is populated) AND has a real URL we can
// audit (products.url IS NOT NULL). That excludes:
//   - tenants who only uploaded a brief without a URL (ONB-02 path),
//   - tenants who created a stub product but never ran ONB-04.
//
// Fan-out is fire-and-forget: each .trigger() is a single HTTP call to the
// Trigger.dev API; the per-tenant auditTarget task carries its own RLS scope
// + per-evaluator 60s budget. A transient failure in one tenant's audit
// doesn't block fan-out to the rest.

interface ActiveProductRow {
  tenant_id: string;
  url: string;
}

export const dailyAuditRerun = schedules.task({
  id: "daily-audit-rerun",
  cron: {
    pattern: "0 7 * * *",
    timezone: "UTC",
  },
  // Same generous cap as daily-morning-brief — fan-out is N HTTP calls; the
  // expensive evaluator work happens in the downstream auditTarget runs.
  maxDuration: 300,
  run: async (payload) => {
    const scheduledAt = payload.timestamp.toISOString();

    if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_POOLED) {
      console.log(
        JSON.stringify({
          source: "agents.cron.daily-audit-rerun",
          level: "warn",
          message: "database_url_unset_skipping",
          scheduledAt,
        }),
      );
      return { ok: true as const, fannedOut: 0, skipped: 0 };
    }

    let fannedOut = 0;
    let skipped = 0;

    try {
      const db = dbPool();
      const result = await db.execute(
        sql`
          SELECT p.tenant_id::text AS tenant_id, p.url AS url
          FROM ${products} p
          WHERE p.url IS NOT NULL
            AND p.metadata ? 'discovery'
        `,
      );
      const rows = (result as unknown as { rows?: ActiveProductRow[] }).rows
        ?? (result as unknown as ActiveProductRow[]);

      for (const row of rows) {
        try {
          await auditTarget.trigger({
            tenantId: row.tenant_id,
            url: row.url,
          });
          fannedOut += 1;
        } catch (err) {
          skipped += 1;
          console.log(
            JSON.stringify({
              source: "agents.cron.daily-audit-rerun",
              level: "warn",
              message: "trigger_failed",
              tenantId: row.tenant_id,
              url: row.url,
              error: err instanceof Error ? err.message : String(err),
            }),
          );
        }
      }
    } catch (err) {
      console.log(
        JSON.stringify({
          source: "agents.cron.daily-audit-rerun",
          level: "error",
          message: "fanout_failed",
          scheduledAt,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      return { ok: false as const, fannedOut, skipped };
    }

    console.log(
      JSON.stringify({
        source: "agents.cron.daily-audit-rerun",
        level: "info",
        message: "fanout_complete",
        scheduledAt,
        fannedOut,
        skipped,
      }),
    );
    return { ok: true as const, fannedOut, skipped };
  },
});
