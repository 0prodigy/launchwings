import { schedules } from "@trigger.dev/sdk";
import { sql } from "drizzle-orm";
import { dbPool, tenants } from "@launchwings/db";
import { insightDailyBrief } from "../tasks/insight";

// 06:00 UTC daily Insight Agent fan-out.
//
// Why this cron is system-level (NOT defineAgent-wrapped):
// schedules.task() injects a system payload (timestamp, lastTimestamp,
// externalId, …) that is per-schedule, not per-tenant. The cron's job is to
// fan out to every active tenant; the per-tenant InsightAgent (defineAgent-
// wrapped, RLS-scoped) is the durable unit. Persisting an agent_runs row at
// the cron-coordinator level would lie about tenant scope.
//
// Fan-out rule: a tenant is "active" iff
//   - it has at least one agent_runs row in the last 30 days, OR
//   - it has at least one products row.
// That excludes orphan tenants from staging fixtures while keeping freshly-
// onboarded founders in the loop on day one.
//
// We do fire-and-forget on .trigger() — Trigger.dev queues the per-tenant
// task durably, so a transient error inside one tenant's task does not block
// fan-out to the rest.
//
// If DATABASE_URL isn't reachable we log a warn and exit cleanly. The cron
// MUST NOT crash the Trigger.dev process; a crashed cron just stops firing.

interface ActiveTenantRow {
  id: string;
}

function isoUtcDate(d: Date): string {
  // YYYY-MM-DD in UTC. Used as the briefFor payload — must match the
  // insightPayloadSchema regex /^\d{4}-\d{2}-\d{2}$/.
  return d.toISOString().slice(0, 10);
}

export const dailyMorningBrief = schedules.task({
  id: "daily-morning-brief",
  cron: {
    pattern: "0 6 * * *",
    timezone: "UTC",
  },
  // Generous cap because fan-out on N tenants is N .trigger() calls; each is a
  // single HTTP round-trip to the trigger.dev API but we don't want to time
  // out at 100+ tenants. Trigger.dev's own per-task timeout still applies on
  // the downstream insightDailyBrief.
  maxDuration: 300,
  run: async (payload) => {
    const scheduledAt = payload.timestamp.toISOString();
    const briefFor = isoUtcDate(payload.timestamp);

    // Bail-out: missing DATABASE_URL means we can't enumerate tenants. Log a
    // warn and exit cleanly so trigger.dev's process keeps running.
    if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_POOLED) {
      console.log(
        JSON.stringify({
          source: "agents.cron.daily-morning-brief",
          level: "warn",
          message: "database_url_unset_skipping",
          scheduledAt,
          briefFor,
        }),
      );
      return { ok: true as const, fannedOut: 0, skipped: 0 };
    }

    let fannedOut = 0;
    let skipped = 0;

    try {
      const db = dbPool();
      // Raw SQL: drizzle-orm's join + groupBy + having flow gets verbose for an
      // OR across two existence checks. We want every tenant where (any
      // agent_runs row in last 30 days) OR (any products row exists).
      const result = await db.execute(
        sql`
          SELECT t.id::text AS id
          FROM ${tenants} t
          WHERE EXISTS (
            SELECT 1 FROM agent_runs ar
            WHERE ar.tenant_id = t.id
              AND ar.created_at >= now() - interval '30 days'
          )
          OR EXISTS (
            SELECT 1 FROM products p WHERE p.tenant_id = t.id
          )
        `,
      );
      // Tolerate both `{ rows }` and array-shaped returns across drivers.
      const rows: ActiveTenantRow[] =
        (result as unknown as { rows?: ActiveTenantRow[] }).rows
        ?? (Array.isArray(result) ? (result as ActiveTenantRow[]) : []);

      for (const row of rows) {
        try {
          await insightDailyBrief.trigger({
            tenantId: row.id,
            briefFor,
          });
          fannedOut += 1;
        } catch (triggerErr) {
          // Per-tenant dispatch failure should NOT abort the rest of the
          // fan-out. Log + continue.
          skipped += 1;
          console.log(
            JSON.stringify({
              source: "agents.cron.daily-morning-brief",
              level: "warn",
              message: "tenant_dispatch_failed",
              tenantId: row.id,
              error:
                triggerErr instanceof Error ? triggerErr.message : String(triggerErr),
            }),
          );
        }
      }
    } catch (err) {
      // DB unreachable / query failure. Log + exit clean — same contract as
      // the bail-out above; we don't want a flaky DB to crash the cron.
      console.log(
        JSON.stringify({
          source: "agents.cron.daily-morning-brief",
          level: "warn",
          message: "tenant_enumeration_failed",
          scheduledAt,
          briefFor,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      return { ok: true as const, fannedOut: 0, skipped: 0 };
    }

    console.log(
      JSON.stringify({
        source: "agents.cron.daily-morning-brief",
        level: "info",
        message: "fan_out_complete",
        scheduledAt,
        briefFor,
        fanned_out: fannedOut,
        skipped,
      }),
    );

    return { ok: true as const, fannedOut, skipped };
  },
});
