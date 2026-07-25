import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { insightDailyBrief } from "@launchwings/agents";
import { dbPool, insightDailyBriefs, withTenant } from "@launchwings/db";
import { protectedProcedure, router } from "../trpc";

// F2 PR2 — Insight Agent tRPC surface.
//
// Procedures:
//   - getLatestBrief (query): newest insight_daily_briefs row for the tenant,
//     or null if none yet (e.g. tenant onboarded between cron firings). RLS
//     guards cross-tenant access; we still scope explicitly on tenantId.
//   - listBriefs (query): paginated list across a UTC date range. Defaults to
//     last 14 days when from/to are omitted.
//   - markBriefRead (mutation): sets read_at = now() on a single brief.
//   - runInsightNow (mutation): dispatches insightDailyBrief for the caller's
//     tenant for today (UTC). Convenience for QA — the cron is the production
//     trigger, but founders / tests may want to kick off ad hoc.
//
// All four procedures are `protectedProcedure` (Clerk-bound tenantId). There
// is no public surface for briefs — they are private to the founder.

const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD UTC date");

function ensureRuntimeConfigured(): void {
  // Mirrors agentsRouter / socialRouter — same PRECONDITION_FAILED shape so the
  // founder UI handles all three uniformly.
  if (!process.env.TRIGGER_SECRET_KEY) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "agents runtime not configured: set TRIGGER_SECRET_KEY in apps/api environment (see SETUP-04 founder follow-ups)",
    });
  }
}

function todayUtcDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export const insightRouter = router({
  getLatestBrief: protectedProcedure.query(async ({ ctx }) => {
    const db = dbPool();
    return withTenant(db, ctx.tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(insightDailyBriefs)
        // Sort by briefFor first (the date the brief covers), then createdAt
        // for safety in the unlikely case two briefs share a UTC day (the
        // unique index forbids that, but the order tie-break is cheap).
        .orderBy(desc(insightDailyBriefs.briefFor), desc(insightDailyBriefs.createdAt))
        .limit(1);
      return { brief: rows[0] ?? null };
    });
  }),

  listBriefs: protectedProcedure
    .input(
      z
        .object({
          from: dateStringSchema.optional(),
          to: dateStringSchema.optional(),
          limit: z.number().int().min(1).max(100).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 14;
      const db = dbPool();
      return withTenant(db, ctx.tenantId, async (tx) => {
        const filters = [];
        if (input?.from) filters.push(gte(insightDailyBriefs.briefFor, input.from));
        if (input?.to) filters.push(lte(insightDailyBriefs.briefFor, input.to));
        const where = filters.length > 0 ? and(...filters) : undefined;

        const rows = await tx
          .select()
          .from(insightDailyBriefs)
          .where(where)
          // Newest first by default — matches the founder UI's "latest brief
          // at the top" intuition. Secondary asc on createdAt is a no-op
          // under the unique (tenant, date) constraint but kept for stability.
          .orderBy(desc(insightDailyBriefs.briefFor), asc(insightDailyBriefs.createdAt))
          .limit(limit);

        return { briefs: rows };
      });
    }),

  markBriefRead: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = dbPool();
      return withTenant(db, ctx.tenantId, async (tx) => {
        const updated = await tx
          .update(insightDailyBriefs)
          .set({ readAt: new Date() })
          .where(eq(insightDailyBriefs.id, input.id))
          .returning();
        const row = updated[0];
        if (!row) {
          // RLS hides cross-tenant rows; same surface for "not found" and
          // "not yours" — don't leak the latter.
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `insight brief ${input.id} not found in this tenant`,
          });
        }
        return { brief: row };
      });
    }),

  runInsightNow: protectedProcedure.mutation(async ({ ctx }) => {
    ensureRuntimeConfigured();
    const briefFor = todayUtcDateString();
    const handle = await insightDailyBrief.trigger({
      tenantId: ctx.tenantId,
      briefFor,
    });
    return {
      triggerRunId: handle.id,
      briefFor,
      agent: "insight-daily-brief" as const,
    };
  }),
});
