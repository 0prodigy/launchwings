import { TRPCError } from "@trpc/server";
import { and, desc, eq, lt } from "drizzle-orm";
import { z } from "zod";
import {
  DIRECTORY_CATALOG,
  directorySubmitterAgent,
  listEnabledDirectories,
} from "@launchwings/agents";
import { dbPool, directorySubmissions, withTenant } from "@launchwings/db";
import { protectedProcedure, publicProcedure, router } from "../trpc";

// F2 PR1 — directory tRPC surface.
//
// Four procedures:
//   - prepareDirectorySubmissions (mutation, protected): kick off the
//     directorySubmitterAgent with a productBrief + directorySlugs (or the
//     "all-enabled" sentinel). Tenant scope is merged from ctx; the client
//     can never forge a tenantId. Returns the trigger run id; clients poll
//     listSubmissions to see the rows once persisted.
//   - listSubmissions (query, protected): paginated list, optionally filtered
//     by status / directory_slug. Cursor is the createdAt of the last row.
//     RLS guards cross-tenant; we still scope explicitly for "not found"
//     vs "not yours" symmetry.
//   - approveSubmission (mutation, protected): the founder review point. The
//     founder may edit the payload before approving (edits is a partial
//     overlay) and transitions to "queued" / "submitted" / "rejected".
//   - getDirectoryCatalog (query, public): returns the in-code catalog.
//     Public because the catalog is reference data — non-sensitive, identical
//     for every tenant. Reads the in-code list (NOT the DB) so the call is
//     instant and doesn't depend on the seed running first. PR1 trade-off;
//     PR2+ may switch to the DB once tenant-level overrides land.

const ALL_ENABLED = "all-enabled" as const;

const productBriefInputSchema = z.object({
  name: z.string().min(1).max(120),
  oneLiner: z.string().min(1).max(400),
  longDescription: z.string().min(1).max(4000),
  url: z.string().url(),
  audience: z.string().min(1).max(400),
  valueProp: z.string().min(1).max(800),
  pricingHint: z.string().max(200).optional(),
  launchDate: z.string().optional(),
  screenshotUrl: z.string().url().optional(),
  logoUrl: z.string().url().optional(),
  categoryHint: z.string().max(120).optional(),
  founderEmail: z.string().email(),
});

const submissionStatusEnum = z.enum([
  "draft",
  "queued",
  "in_progress",
  "submitted",
  "rejected",
  "needs_manual",
]);

// approveSubmission only accepts a subset of statuses — the agent worker
// (PR2/PR3) is the only thing that should ever set "in_progress" or
// "needs_manual"; the founder UI exposes queue / submitted / rejected.
const approveStatusEnum = z.enum(["queued", "submitted", "rejected"]);

function ensureRuntimeConfigured(): void {
  if (!process.env.TRIGGER_SECRET_KEY) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "agents runtime not configured: set TRIGGER_SECRET_KEY in apps/api environment",
    });
  }
}

export const directoryRouter = router({
  prepareDirectorySubmissions: protectedProcedure
    .input(
      z.object({
        productBrief: productBriefInputSchema,
        // Either an explicit list of slugs OR the "all-enabled" sentinel. We
        // prefer a sentinel over an empty array because the empty array could
        // mean "intentionally none" if a future UI lets the founder click-to-
        // exclude every directory; an explicit sentinel disambiguates.
        directorySlugs: z
          .union([z.array(z.string()).min(1).max(40), z.literal(ALL_ENABLED)])
          .default(ALL_ENABLED),
        voiceProfile: z
          .object({
            samples: z.array(z.string().min(1)).max(20),
            guidelines: z.string().max(2000).optional(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      ensureRuntimeConfigured();

      const slugs =
        input.directorySlugs === ALL_ENABLED
          ? listEnabledDirectories().map((d) => d.slug)
          : input.directorySlugs;

      if (slugs.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "no enabled directories in catalog",
        });
      }

      const handle = await directorySubmitterAgent.trigger({
        tenantId: ctx.tenantId,
        productBrief: input.productBrief,
        directorySlugs: slugs,
        ...(input.voiceProfile ? { voiceProfile: input.voiceProfile } : {}),
      });

      return {
        triggerRunId: handle.id,
        agent: "directory-submitter" as const,
        directoryCount: slugs.length,
      };
    }),

  listSubmissions: protectedProcedure
    .input(
      z
        .object({
          status: submissionStatusEnum.optional(),
          directorySlug: z.string().optional(),
          limit: z.number().int().min(1).max(100).optional(),
          // ISO timestamp of the last row's createdAt for keyset pagination.
          after: z.string().datetime().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 20;
      const db = dbPool();
      return withTenant(db, ctx.tenantId, async (tx) => {
        const filters = [];
        if (input?.status) filters.push(eq(directorySubmissions.status, input.status));
        if (input?.directorySlug)
          filters.push(eq(directorySubmissions.directorySlug, input.directorySlug));
        if (input?.after)
          filters.push(lt(directorySubmissions.createdAt, new Date(input.after)));

        const where = filters.length > 0 ? and(...filters) : undefined;

        const rows = await tx
          .select()
          .from(directorySubmissions)
          .where(where)
          .orderBy(desc(directorySubmissions.createdAt))
          .limit(limit + 1);

        const hasMore = rows.length > limit;
        const page = hasMore ? rows.slice(0, limit) : rows;
        const last = page[page.length - 1];
        const nextCursor = hasMore && last ? last.createdAt.toISOString() : null;

        return {
          submissions: page,
          nextCursor,
        };
      });
    }),

  approveSubmission: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        // Partial overlay onto payload_json. Founder edits (e.g. shortening a
        // tagline) are merged shallowly into the existing payload before status
        // changes. We don't validate per-directory schema here — the worker
        // (PR2/PR3) re-validates against the catalog at submission time.
        edits: z.record(z.string(), z.unknown()).optional(),
        status: approveStatusEnum,
        submittedUrl: z.string().url().optional(),
        rejectReason: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = dbPool();
      return withTenant(db, ctx.tenantId, async (tx) => {
        // Read first so we can merge edits onto the existing payload.
        // RLS will hide cross-tenant rows; if SELECT returns nothing the row
        // either doesn't exist OR isn't ours — same surface for both.
        const existing = await tx
          .select()
          .from(directorySubmissions)
          .where(eq(directorySubmissions.id, input.id))
          .limit(1);

        const row = existing[0];
        if (!row) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `directory submission ${input.id} not found in this tenant`,
          });
        }

        const existingPayload = (row.payloadJson ?? {}) as Record<string, unknown>;
        const mergedPayload = input.edits
          ? { ...existingPayload, ...input.edits }
          : existingPayload;

        const patch: Record<string, unknown> = {
          status: input.status,
          payloadJson: mergedPayload,
          updatedAt: new Date(),
        };
        if (input.status === "submitted") {
          if (input.submittedUrl) patch.submittedUrl = input.submittedUrl;
          patch.submittedAt = new Date();
        }
        if (input.status === "rejected" && input.rejectReason) {
          patch.rejectReason = input.rejectReason;
        }

        const updated = await tx
          .update(directorySubmissions)
          .set(patch)
          .where(eq(directorySubmissions.id, input.id))
          .returning();

        const updatedRow = updated[0];
        if (!updatedRow) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `directory submission ${input.id} disappeared mid-update`,
          });
        }
        return { submission: updatedRow };
      });
    }),

  getDirectoryCatalog: publicProcedure.query(() => {
    // Reference data; identical for every caller. Returned as plain objects
    // so the web client can render without needing the agent package.
    return {
      directories: DIRECTORY_CATALOG.map((d) => ({
        slug: d.slug,
        name: d.name,
        submissionUrl: d.submissionUrl,
        automationKind: d.automationKind,
        category: d.category,
        instructionsMd: d.instructionsMd,
        fieldSchemaJson: d.fieldSchemaJson,
        notes: d.notes ?? null,
        enabled: d.enabled,
      })),
    };
  }),
});
