import { TRPCError } from "@trpc/server";
import { and, desc, eq, lt } from "drizzle-orm";
import { z } from "zod";
import { socialDraftAgent } from "@launchwings/agents";
import { dbPool, socialDrafts, withTenant } from "@launchwings/db";
import { protectedProcedure, router } from "../trpc";

// F2 PR1 — social-draft tRPC surface.
//
// Three procedures:
//   - runSocialDraft (mutation): kick off the social-draft trigger task. Same
//     contract as runAudit; tenantId is server-side from ctx, never client-
//     supplied. Returns the trigger run id; clients poll via listDrafts to
//     see the rows once persisted.
//   - listDrafts (query): paginated list, optionally filtered by status /
//     channel. Cursor is the createdAt of the last row (ISO string), DESC.
//     RLS guards cross-tenant; we still scope explicitly for "not found"
//     vs "not yours" symmetry.
//   - setDraftStatus (mutation): transition a draft to approved / scheduled /
//     posted / rejected. The posted_url + posted_at fields are caller-supplied
//     today (PR2 social-posting agent will fill them automatically).

const channelEnum = z.enum(["x", "linkedin", "reddit", "bluesky", "threads"]);
const statusEnum = z.enum([
  "draft",
  "approved",
  "scheduled",
  "posted",
  "rejected",
]);

const productBriefInputSchema = z.object({
  name: z.string().min(1).max(120),
  oneLiner: z.string().min(1).max(400),
  url: z.string().url().optional(),
  audience: z.string().min(1).max(400),
  valueProp: z.string().min(1).max(800),
  callToAction: z.string().min(1).max(200).optional(),
});

function ensureRuntimeConfigured(): void {
  // Identical guard to agentsRouter — kept inline (and not extracted) so each
  // router fails fast with its own message and PRECONDITION_FAILED is the
  // right shape for the founder UI.
  if (!process.env.TRIGGER_SECRET_KEY) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "agents runtime not configured: set TRIGGER_SECRET_KEY in apps/api environment (see SETUP-04 founder follow-ups)",
    });
  }
}

export const socialRouter = router({
  runSocialDraft: protectedProcedure
    .input(
      z.object({
        productBrief: productBriefInputSchema,
        channels: z.array(channelEnum).min(1),
        count: z.number().int().min(1).max(5).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      ensureRuntimeConfigured();

      const handle = await socialDraftAgent.trigger({
        tenantId: ctx.tenantId,
        productBrief: input.productBrief,
        channels: input.channels,
        // Apply the agent default (2) when the client omits it. Surfacing the
        // default here keeps the trigger payload deterministic for tests.
        count: input.count ?? 2,
      });

      return {
        triggerRunId: handle.id,
        agent: "social-draft" as const,
      };
    }),

  listDrafts: protectedProcedure
    .input(
      z
        .object({
          status: statusEnum.optional(),
          channel: channelEnum.optional(),
          limit: z.number().int().min(1).max(100).optional(),
          // ISO timestamp of the last row's createdAt for keyset pagination.
          // Not a row id — sort-key is createdAt DESC for newest-first UX.
          after: z.string().datetime().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 20;
      const db = dbPool();
      return withTenant(db, ctx.tenantId, async (tx) => {
        const filters = [];
        if (input?.status) filters.push(eq(socialDrafts.status, input.status));
        if (input?.channel) filters.push(eq(socialDrafts.channel, input.channel));
        if (input?.after) filters.push(lt(socialDrafts.createdAt, new Date(input.after)));

        const where = filters.length > 0 ? and(...filters) : undefined;

        // limit+1 so we can detect a next page without a count query.
        const rows = await tx
          .select()
          .from(socialDrafts)
          .where(where)
          .orderBy(desc(socialDrafts.createdAt))
          .limit(limit + 1);

        const hasMore = rows.length > limit;
        const page = hasMore ? rows.slice(0, limit) : rows;
        const last = page[page.length - 1];
        const nextCursor = hasMore && last ? last.createdAt.toISOString() : null;

        return {
          drafts: page,
          nextCursor,
        };
      });
    }),

  setDraftStatus: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: statusEnum,
        postedUrl: z.string().url().optional(),
        postedAt: z.string().datetime().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = dbPool();
      return withTenant(db, ctx.tenantId, async (tx) => {
        // Build the patch object — postedUrl/postedAt are only set when
        // transitioning to "posted" (or a caller is back-filling history).
        // We don't enforce that constraint server-side to keep the agent
        // (PR2 social-posting) free to set them in any order it needs.
        const patch: Record<string, unknown> = {
          status: input.status,
          updatedAt: new Date(),
        };
        if (input.postedUrl !== undefined) patch.postedUrl = input.postedUrl;
        if (input.postedAt !== undefined) patch.postedAt = new Date(input.postedAt);

        const updated = await tx
          .update(socialDrafts)
          .set(patch)
          .where(eq(socialDrafts.id, input.id))
          .returning();

        const row = updated[0];
        if (!row) {
          // RLS hides cross-tenant rows; same surface for "not found" and
          // "not yours" — don't leak the latter.
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `social draft ${input.id} not found in this tenant`,
          });
        }
        return { draft: row };
      });
    }),
});
