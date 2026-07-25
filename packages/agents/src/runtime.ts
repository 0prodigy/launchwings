import { schemaTask, type Context } from "@trigger.dev/sdk";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { agentRuns, dbPool, withTenant, type DbPool } from "@launchwings/db";
import { llm as rawLlm, type LLMRequest, type LLMResponse } from "./llm";

// ---------------------------------------------------------------------------
// defineAgent — the only sanctioned way to declare a Trigger.dev v3 task in
// LaunchWings. Wraps `task()` (via `schemaTask` so payload validation happens
// inside the trigger.dev runtime, not in our user-land run() body) with the
// three guarantees SETUP-04 demands:
//
//   1. An agent_runs row is INSERTed at start (status="running") capturing
//      agentName, tenantId, inputJson, triggerRunId. Returned id is threaded
//      into the run body so the agent can correlate logs.
//   2. On success the row is UPDATEd to status="succeeded" with outputJson
//      and finishedAt; on failure UPDATEd to status="failed". costUsdMicros
//      defaults to 0; SETUP-05's llm wrapper will increment it from inside
//      run() before completion.
//   3. The user-supplied run body executes inside withTenant(dbPool, tenantId,
//      ...) so RLS policies on agent_runs and downstream tables fire on
//      every query the agent issues. Trigger.dev's worker runs outside our
//      Hono request scope, so this transactional SET LOCAL is the ONLY thing
//      keeping cross-tenant leakage closed when SETUP-05+ tasks read user data.
//
// Rationale for using schemaTask over plain task():
// - Trigger.dev re-validates the payload at queue dequeue time, catching
//   poisoned messages from old code paths after a deploy.
// - The TPayload type for run() is inferred from the schema; the user can't
//   forget to declare tenantId because BaseAgentPayload extends require it.
// ---------------------------------------------------------------------------

// Every agent payload MUST carry tenantId. Trigger.dev's TriggerOptions don't
// expose a metadata channel that the worker can read at dequeue time, so we
// inline tenant scope into the payload itself. tRPC procedures that .trigger()
// must merge ctx.tenantId in before calling.
export const baseAgentPayload = z.object({
  tenantId: z.string().uuid(),
});
export type BaseAgentPayload = z.infer<typeof baseAgentPayload>;

/**
 * Helpers handed to every agent run body. Exposes the cassette-aware llm()
 * (auto-rolls cost into the agent_runs row), a structured logger, and the
 * RLS-scoped db handle (already inside SET LOCAL app.tenant_id).
 *
 * Why a helpers object rather than module imports: SETUP-05 needs every
 * llm() call from inside an agent to (a) increment costUsdMicros on the
 * agent_runs row and (b) be cassette-replayable in CI. Both behaviours are
 * scope-bound — they belong to a single agent execution, not to the module.
 */
export type AgentHelpers = {
  /** Cassette-aware llm. Increments agentRuns.costUsdMicros on each call. */
  llm: (req: LLMRequest) => Promise<LLMResponse>;
  /** Single-line JSON structured log, scoped to this agent run. */
  logEvent: (line: Record<string, unknown>) => void;
};

export type AgentRunContext = {
  /** Our agent_runs.id — distinct from Trigger.dev's run id. Use for log correlation. */
  agentRunId: string;
  /** Trigger.dev's run id, mirrored from ctx.run.id. */
  triggerRunId: string;
  /** Convenience: the tenantId pulled out of payload. */
  tenantId: string;
  /** A pool-bound, RLS-scoped drizzle handle. Already inside SET LOCAL app.tenant_id. */
  tx: DbPool;
  /** Run-scoped helpers (llm, logEvent). See AgentHelpers. */
  helpers: AgentHelpers;
};

export type DefineAgentParams<
  TIdentifier extends string,
  TSchema extends z.ZodType<BaseAgentPayload>,
  TOutput,
> = {
  name: TIdentifier;
  schema: TSchema;
  run: (
    payload: z.infer<TSchema>,
    runCtx: AgentRunContext,
    triggerCtx: Context,
  ) => Promise<TOutput>;
};

function logJson(line: Record<string, unknown>): void {
  console.log(JSON.stringify({ source: "agents-runtime", ...line }));
}

export function defineAgent<
  TIdentifier extends string,
  TSchema extends z.ZodType<BaseAgentPayload>,
  TOutput,
>(params: DefineAgentParams<TIdentifier, TSchema, TOutput>) {
  const { name, schema, run } = params;

  return schemaTask({
    id: name,
    schema,
    run: async (payload, { ctx }) => {
      const triggerRunId = ctx.run.id;
      const tenantId = payload.tenantId;
      const startedAtIso = new Date().toISOString();

      logJson({
        level: "info",
        agent: name,
        triggerRunId,
        tenantId,
        message: "agent_start",
      });

      // Persist the agent_runs row OUTSIDE the user's withTenant transaction
      // so that the row is visible for observability even if the user code
      // crashes mid-transaction. We then open a SECOND transaction inside the
      // user run() body for tenant-scoped queries. This costs one extra
      // round-trip per run; acceptable until LRC-01 measures it as hot.
      const db = dbPool();
      const [inserted] = await db
        .insert(agentRuns)
        .values({
          tenantId,
          agentName: name,
          triggerRunId,
          status: "running",
          inputJson: payload as unknown as Record<string, unknown>,
          startedAt: new Date(startedAtIso),
        })
        .returning({ id: agentRuns.id });

      if (!inserted) {
        // Defensive: insert.returning() shouldn't return [] but we type-narrow.
        throw new Error("agents-runtime: failed to persist agent_runs row");
      }
      const agentRunId = inserted.id;

      try {
        const output = await withTenant(db, tenantId, async (tx) => {
          // Build run-scoped helpers. The llm helper wraps the bare llm()
          // export so every call from inside this run body (a) is cassette-
          // replayable in CI and (b) increments agent_runs.cost_usd_micros
          // by the cost of each call. We update the row from the OUTER db
          // pool (not tx) because tx may be mid-statement when the user code
          // awaits llm(); writing the cost on a separate connection avoids
          // serialisation order surprises if the user's tx later rolls back
          // — we still want the spend recorded.
          const wrappedLlm = async (req: LLMRequest): Promise<LLMResponse> => {
            const resp = await rawLlm(req);
            try {
              await db
                .update(agentRuns)
                .set({
                  costUsdMicros: sql`${agentRuns.costUsdMicros} + ${resp.costUsdMicros}`,
                })
                .where(eq(agentRuns.id, agentRunId));
            } catch (persistErr) {
              // Log and swallow — we never want a cost-bookkeeping failure to
              // surface as an evaluator error. The structured log is the
              // signal for ops to chase down.
              logJson({
                level: "warn",
                agent: name,
                triggerRunId,
                tenantId,
                agentRunId,
                message: "agent_cost_persist_failed",
                error: persistErr instanceof Error ? persistErr.message : String(persistErr),
                costUsdMicros: resp.costUsdMicros,
              });
            }
            return resp;
          };

          const helpers: AgentHelpers = {
            llm: wrappedLlm,
            logEvent: (line) => logJson({ agent: name, triggerRunId, tenantId, agentRunId, ...line }),
          };

          return run(
            payload,
            {
              agentRunId,
              triggerRunId,
              tenantId,
              tx,
              helpers,
            },
            ctx,
          );
        });

        await db
          .update(agentRuns)
          .set({
            status: "succeeded",
            outputJson: (output ?? null) as unknown as Record<string, unknown>,
            finishedAt: new Date(),
          })
          .where(eq(agentRuns.id, agentRunId));

        logJson({
          level: "info",
          agent: name,
          triggerRunId,
          tenantId,
          agentRunId,
          message: "agent_success",
        });

        return output;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Best-effort persistence of failure. If THIS update fails (DB down)
        // we still rethrow so trigger.dev's retry policy sees the failure.
        try {
          await db
            .update(agentRuns)
            .set({
              status: "failed",
              outputJson: { error: message } as unknown as Record<string, unknown>,
              finishedAt: new Date(),
            })
            .where(eq(agentRuns.id, agentRunId));
        } catch (persistErr) {
          logJson({
            level: "error",
            agent: name,
            triggerRunId,
            tenantId,
            agentRunId,
            message: "agent_failure_persist_failed",
            persistError:
              persistErr instanceof Error ? persistErr.message : String(persistErr),
          });
        }

        logJson({
          level: "error",
          agent: name,
          triggerRunId,
          tenantId,
          agentRunId,
          message: "agent_failure",
          error: message,
        });

        throw err;
      }
    },
  });
}

