import { z } from "zod";
import {
  runEvaluators,
  stage1Evaluators,
  BUILD_PLATFORM_EVALUATOR_ID,
  type BuildPlatformEvaluatorEvidence,
  type LlmFn,
  type RunResult,
} from "@launchwings/lrs";
import { dbPool, productBuildPlatformDetections, withTenant } from "@launchwings/db";
import { baseAgentPayload, defineAgent } from "../runtime";
import type { LLMRequest, ModelId } from "../llm";

// LRC-01 PR1 — auditTarget Trigger.dev task.
//
// Acceptance criteria from the PR1 ticket:
//
//   - Payload `{ url: string, tenantId: string }` (tenantId via baseAgentPayload).
//   - Body uses `defineAgent` so the runtime gets the agent_runs row +
//     SET LOCAL tenant scope — RLS for the lrs_runs / lrs_results inserts the
//     LRS runner does inside `runEvaluators` then fires correctly.
//   - Calls `runEvaluators` with the LRS registry (currently
//     dogfood-LRS-07 + dogfood-LRS-08; PR2 adds the rest).
//   - Returns the run summary.
//
// Important: we DO pass `persistResults: true` and tenantId. The LRS runner
// opens its own transactions (via withTenant) for the lrs_runs / lrs_results
// writes, distinct from the agents-runtime transaction that wraps this run.
// That's deliberate — the agents-runtime transaction is reserved for
// agent_runs; the LRS rows persist on a fresh transaction so they're visible
// even if something later in the run body fails.

export const auditTargetPayloadSchema = baseAgentPayload.extend({
  url: z.string().url(),
});

export type AuditTargetPayload = z.infer<typeof auditTargetPayloadSchema>;

export type AuditTargetOutput = {
  runId: string;
  summary: RunResult["summary"];
  /** Echoed for log correlation; the full per-evaluator results live in
   *  `lrs_results` (queried by the getAuditRun tRPC procedure). */
  resultCount: number;
};

export const auditTarget = defineAgent({
  name: "audit-target",
  schema: auditTargetPayloadSchema,
  run: async (payload, runCtx): Promise<AuditTargetOutput> => {
    const { url, tenantId } = payload;
    runCtx.helpers.logEvent({
      level: "info",
      source: "agents.audit-target",
      message: "audit_started",
      url,
    });

    // Adapt the agents helpers.llm() — which speaks the rich `LLMRequest` /
    // `LLMResponse` shape — down to the narrower `LlmFn` contract that
    // `packages/lrs` declares (LRC-01 PR1 decision #1: agents↔lrs cycle is
    // resolved via dependency-injection of an abstract `LlmFn`). Adapter is
    // a few lines because the shapes are nearly identical.
    const llm: LlmFn = async (opts) => {
      const req: LLMRequest = {
        // The LRS-side type is `string` (so `lrs` doesn't have to import the
        // ModelId union); we cast at the boundary. If a caller hands us a
        // model id the agents llm doesn't know about, llm() throws
        // LLMConfigError — which we WANT, surfaces as a fail row.
        model: opts.model as ModelId,
        messages: opts.messages,
        ...(opts.system !== undefined ? { system: opts.system } : {}),
        ...(opts.maxTokens !== undefined ? { maxOutputTokens: opts.maxTokens } : {}),
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      };
      const resp = await runCtx.helpers.llm(req);
      return {
        text: resp.text,
        costUsdMicros: resp.costUsdMicros,
        modelUsed: resp.modelUsed,
      };
    };

    const runResult = await runEvaluators(
      { url },
      stage1Evaluators(),
      {
        tenantId,
        persistResults: true,
        llm,
      },
    );

    // Build-Platform Integration PR1 — accumulate the detection dataset.
    // Per BUILD_PLATFORM_INTEGRATIONS.md "Why this is a moat", every audit
    // run that detected a platform produces one row in
    // product_build_platform_detections; we record null detections too so
    // the rate-of-build-platform-traffic is computable. Persistence is
    // best-effort: a failure here MUST NOT fail the audit (the audit
    // results are the customer-facing artefact). We log the error and
    // move on — the structured log is the signal for ops to chase.
    const buildPlatformResult = runResult.results.find(
      (r) => r.evaluatorId === BUILD_PLATFORM_EVALUATOR_ID,
    );
    if (buildPlatformResult) {
      const evidence = buildPlatformResult.evidenceJson as unknown as
        | BuildPlatformEvaluatorEvidence
        | { error: string };
      // The runner synthesises a fail row with `evidenceJson.error` when
      // an evaluator throws; skip persistence in that case (no detection
      // payload to record).
      if (!("error" in evidence)) {
        try {
          const db = dbPool();
          await withTenant(db, tenantId, async (tx) => {
            await tx.insert(productBuildPlatformDetections).values({
              tenantId,
              productUrl: url,
              platform: evidence.platform,
              confidence: evidence.confidence,
              signalsJson: evidence.signals as unknown as Record<string, unknown>,
              lrsRunId: runResult.runId,
            });
          });
          runCtx.helpers.logEvent({
            level: "info",
            source: "agents.audit-target",
            message: "build_platform_detected_persisted",
            url,
            runId: runResult.runId,
            platform: evidence.platform,
            confidence: evidence.confidence,
          });
        } catch (persistErr) {
          runCtx.helpers.logEvent({
            level: "warn",
            source: "agents.audit-target",
            message: "build_platform_detected_persist_failed",
            url,
            runId: runResult.runId,
            error: persistErr instanceof Error ? persistErr.message : String(persistErr),
          });
        }
      }
    }

    runCtx.helpers.logEvent({
      level: "info",
      source: "agents.audit-target",
      message: "audit_completed",
      url,
      runId: runResult.runId,
      summary: runResult.summary,
    });

    return {
      runId: runResult.runId,
      summary: runResult.summary,
      resultCount: runResult.results.length,
    };
  },
});
