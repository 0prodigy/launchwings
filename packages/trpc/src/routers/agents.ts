import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { auditTarget, helloAgent } from "@launchwings/agents";
import {
  dbPool,
  lrsResults,
  lrsRuns,
  products,
  withTenant,
} from "@launchwings/db";
import { protectedProcedure, router } from "../trpc";

// Thin tRPC surface over the Trigger.dev v3 task handles in @launchwings/agents.
// The web client never imports `@launchwings/agents` directly — these
// procedures are the only sanctioned entry point so that:
//   1. Tenant scope (ctx.tenantId) is always merged into the agent payload
//      server-side. The client cannot forge a tenantId.
//   2. The Trigger.dev secret stays on the api side; the web bundle never sees
//      TRIGGER_SECRET_KEY.
//   3. Auth (SETUP-03) and rate-limiting hooks land in one place.
//
// SETUP-04 ships only `runHello`; SETUP-05+ tickets add real-agent procedures
// (LRC-01 audit kickoff, etc.).

function ensureRuntimeConfigured(): void {
  // Trigger.dev's SDK reads TRIGGER_SECRET_KEY from process.env at call time.
  // Surface a clean PRECONDITION_FAILED to the caller when the founder hasn't
  // wired the secret yet, instead of letting trigger.dev throw a generic
  // "Authentication failed" at HTTP boundary.
  if (!process.env.TRIGGER_SECRET_KEY) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "agents runtime not configured: set TRIGGER_SECRET_KEY in apps/api environment (see SETUP-04 founder follow-ups)",
    });
  }
}

export const agentsRouter = router({
  runHello: protectedProcedure
    .input(
      z
        .object({
          name: z.string().min(1).max(100).optional(),
        })
        .optional(),
    )
    .mutation(async ({ ctx, input }) => {
      ensureRuntimeConfigured();

      const handle = await helloAgent.trigger({
        tenantId: ctx.tenantId,
        name: input?.name,
      });

      return {
        runId: handle.id,
        agent: "hello-agent" as const,
      };
    }),

  // LRC-01 PR1 — kick off an LRS audit against a URL.
  //
  // We do NOT pre-create the lrs_runs row here. The Trigger.dev task body
  // (auditTarget → runEvaluators) inserts it inside the agents-runtime tenant
  // scope. That keeps the persistence path single-sourced; if the trigger.dev
  // dispatch never lands a task (e.g. quota), there's no orphan row.
  runAudit: protectedProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      ensureRuntimeConfigured();

      const handle = await auditTarget.trigger({
        tenantId: ctx.tenantId,
        url: input.url,
      });

      return {
        // We surface Trigger.dev's run id as `triggerRunId`; the LRS run id
        // (lrs_runs.id) is generated inside the task and returned in its
        // output. Clients poll `getAuditRun` once Trigger.dev marks the run
        // complete to read the final lrs_runs row.
        triggerRunId: handle.id,
        agent: "audit-target" as const,
      };
    }),

  // Read a completed (or in-flight) audit run + its per-evaluator results.
  // RLS on lrs_runs and lrs_results guarantees cross-tenant isolation; we
  // still scope by tenant_id explicitly so a wrong runId returns "not found"
  // rather than leaking that the row exists for someone else.
  getAuditRun: protectedProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const db = dbPool();
      return withTenant(db, ctx.tenantId, async (tx) => {
        const runs = await tx
          .select()
          .from(lrsRuns)
          .where(eq(lrsRuns.id, input.runId));
        const run = runs[0];
        if (!run) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `audit run ${input.runId} not found in this tenant`,
          });
        }
        const results = await tx
          .select()
          .from(lrsResults)
          .where(eq(lrsResults.runId, input.runId));
        return { run, results };
      });
    }),

  // T4 — fetch the most recent LRS run for a given product, plus its
  // per-evaluator results. Used by the LRS scorecard UI to render "latest
  // audit" without making the client juggle runId lookups.
  //
  // Architect's plan (option a): thin proc, no schema migration. lrs_runs has
  // no product_id FK by design (see schema.ts:149-164); we resolve via
  // target_url == products.url within the tenant scope. Trade-off: if a
  // founder imports two products with the SAME url, this returns the most
  // recent run regardless of which product it was kicked off "for". Rare
  // enough to defer; a future ticket can add a product_id FK + backfill.
  //
  // Response shape is a tagged union on `reason` so the client switches
  // cleanly without nullability gymnastics:
  //   { run: null,    results: [],      reason: "no_url" }  // product has no url
  //   { run: null,    results: [],      reason: "no_run" }  // url present, no runs yet
  //   { run: <row>,   results: <rows>,  reason: "ok"     }
  getLatestRunForProduct: protectedProcedure
    .input(z.object({ productId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const db = dbPool();
      return withTenant(db, ctx.tenantId, async (tx) => {
        const productRows = await tx
          .select()
          .from(products)
          .where(eq(products.id, input.productId));
        const product = productRows[0];
        if (!product) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `product ${input.productId} not found in this tenant`,
          });
        }

        if (product.url == null) {
          return {
            run: null,
            results: [],
            reason: "no_url" as const,
          };
        }

        const runs = await tx
          .select()
          .from(lrsRuns)
          .where(
            and(
              eq(lrsRuns.tenantId, ctx.tenantId),
              eq(lrsRuns.targetUrl, product.url),
            ),
          )
          .orderBy(desc(lrsRuns.createdAt))
          .limit(1);
        const run = runs[0];
        if (!run) {
          return {
            run: null,
            results: [],
            reason: "no_run" as const,
          };
        }

        const results = await tx
          .select()
          .from(lrsResults)
          .where(eq(lrsResults.runId, run.id));
        return { run, results, reason: "ok" as const };
      });
    }),
});
