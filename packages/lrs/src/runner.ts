import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { dbPool, lrsResults, lrsRuns, withTenant } from "@launchwings/db";
import {
  RetryableError,
  type AuditContext,
  type AuditTarget,
  type EvalResult,
  type Evaluator,
  type LlmFn,
  type RunSummary,
} from "./types";

// runEvaluators — the parallel runner.
//
// Design notes (per SETUP-01-monorepo-design.md §8 "build internally"):
//
// 1. **Concurrency cap.** We default to 8 concurrent evaluators. This is the
//    sweet spot for Stage 1: most evaluators are HTTP-bound (cheerio parses
//    are fast); 8 saturates the per-target outbound link without flooding
//    Fly's egress pool. Configurable via `concurrency` for tests + future
//    high-fanout audits.
//
// 2. **Promise.allSettled.** The runner does NOT short-circuit on a single
//    evaluator failure. The whole point of the audit is to surface ALL
//    failures at once. A throw inside an evaluator becomes a synthesised
//    `severity: "fail"` row whose `evidenceJson.error` carries the message.
//
// 3. **Retry policy.** Only `RetryableError` is retried — up to 2x with
//    exponential backoff (250ms, 500ms). All other throws are treated as
//    deterministic findings. This is intentional: a wrong assumption like
//    "every site has a meta description" is a bug, not a transient.
//
// 4. **Persistence is opt-out.** Tests inject `persistResults: false` to
//    avoid spinning Postgres. Production callers (the auditTarget Trigger.dev
//    task) leave it true. We persist via `withTenant(dbPool, tenantId, ...)`
//    so RLS fires; the caller MUST supply tenantId when persisting.

export type RunnerOptions = {
  /** Max concurrent evaluator invocations. Default 8. */
  concurrency?: number;
  /** Wall-clock budget for the whole evaluator fan-out, in ms. Any
   *  evaluator still running when the deadline hits is recorded as a
   *  `severity: "fail"` row with `evidenceJson.error = "harness_timeout"`.
   *  Default 60_000ms (60s, per LRC-01 spec). Set to 0 to disable. */
  budgetMs?: number;
  /** Persist run + results into Postgres. Default true. */
  persistResults?: boolean;
  /** Tenant scope for persistence. Required when persistResults !== false. */
  tenantId?: string;
  /** Override for tests + future timekeepers. Defaults to performance.now(). */
  now?: () => number;
  /** Override fetch — mainly for tests. Default uses Node's global fetch. */
  fetchImpl?: typeof fetch;
  /** Override the HTML fetch helper for the AuditContext. Tests use this to
   *  feed a recorded fixture without going to the network. */
  fetchHtml?: AuditContext["fetchHtml"];
  /** Already-allocated run id. Default: `randomUUID()`. */
  runId?: string;
  /** Optional LLM injection. The auditTarget Trigger task supplies the
   *  cassette-aware, cost-tracking `helpers.llm`. Tests pass a small mock or
   *  leave it undefined so llm-less evaluators take their `skipped` warn
   *  path. The runner forwards this verbatim into `AuditContext.llm`. */
  llm?: LlmFn;
};

export type RunResult = {
  runId: string;
  results: EvalResult[];
  summary: RunSummary;
};

const DEFAULT_CONCURRENCY = 8;
const DEFAULT_BUDGET_MS = 60_000;
const RETRY_BACKOFFS_MS = [250, 500];

function defaultFetchHtml(fetchImpl: typeof fetch): AuditContext["fetchHtml"] {
  return async (url: string) => {
    const res = await fetchImpl(url, {
      redirect: "follow",
      headers: {
        // Identify ourselves so a target's logs can correlate. We hit the
        // public marketing URL only; no auth.
        "user-agent": "LaunchWings-LRS-Audit/0.1 (+https://launchwings.com)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    const html = await res.text();
    return { html, finalUrl: res.url, status: res.status };
  };
}

function summarise(results: EvalResult[]): RunSummary {
  const summary: RunSummary = {
    total: results.length,
    pass: 0,
    warn: 0,
    fail: 0,
    errored: 0,
    totalEvaluatorMs: 0,
    totalCostUsdMicros: 0,
  };
  for (const r of results) {
    if (r.severity === "pass") summary.pass += 1;
    else if (r.severity === "warn") summary.warn += 1;
    else summary.fail += 1;
    if (
      typeof r.evidenceJson === "object" &&
      r.evidenceJson !== null &&
      "error" in r.evidenceJson
    ) {
      summary.errored += 1;
    }
    summary.totalEvaluatorMs += r.latencyMs;
    summary.totalCostUsdMicros += r.costUsdMicros;
  }
  return summary;
}

async function runOne(
  evaluator: Evaluator,
  target: AuditTarget,
  ctx: AuditContext,
): Promise<EvalResult> {
  let lastErr: unknown = undefined;
  for (let attempt = 0; attempt <= RETRY_BACKOFFS_MS.length; attempt += 1) {
    const start = ctx.now();
    try {
      const result = await evaluator.evaluate(target, ctx);
      // Defensive: if an evaluator forgot to set latencyMs, fill it.
      if (!Number.isFinite(result.latencyMs) || result.latencyMs < 0) {
        return { ...result, latencyMs: Math.max(0, ctx.now() - start) };
      }
      return result;
    } catch (err) {
      lastErr = err;
      if (err instanceof RetryableError && attempt < RETRY_BACKOFFS_MS.length) {
        const backoff = RETRY_BACKOFFS_MS[attempt] ?? 0;
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      // Non-retryable, or retries exhausted: synthesise a fail row.
      const message = err instanceof Error ? err.message : String(err);
      return {
        evaluatorId: evaluator.id,
        severity: "fail",
        score: 0,
        latencyMs: Math.max(0, ctx.now() - start),
        costUsdMicros: 0,
        evidenceJson: {
          error: message,
          retryable: err instanceof RetryableError,
          attempts: attempt + 1,
        },
        fixActionMarkdown: `Evaluator \`${evaluator.id}\` errored: ${message}. This is a harness-side failure, not a finding on the audited site. Re-run; if it persists, file a bug.`,
      };
    }
  }
  // Unreachable, but TS doesn't know that.
  throw lastErr instanceof Error ? lastErr : new Error("runOne: exhausted retries");
}

/** Runs evaluators in parallel with a concurrency cap. The shared `results`
 *  array is mutated as workers complete, so a caller racing against a
 *  deadline can snapshot partial progress. */
async function runWithConcurrency(
  evaluators: Evaluator[],
  target: AuditTarget,
  ctx: AuditContext,
  concurrency: number,
  results: Array<EvalResult | undefined>,
): Promise<void> {
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const idx = next;
      next += 1;
      if (idx >= evaluators.length) return;
      const evaluator = evaluators[idx];
      if (!evaluator) return;
      results[idx] = await runOne(evaluator, target, ctx);
    }
  }
  const workerCount = Math.min(Math.max(1, concurrency), evaluators.length);
  const workers: Promise<void>[] = [];
  for (let i = 0; i < workerCount; i += 1) workers.push(worker());
  // We use Promise.allSettled to be defensive — runOne already swallows
  // throws, but if a future change leaks one, we want the run to complete.
  await Promise.allSettled(workers);
}

export async function runEvaluators(
  target: AuditTarget,
  evaluators: Evaluator[],
  options: RunnerOptions = {},
): Promise<RunResult> {
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const persistResults = options.persistResults !== false;
  const now = options.now ?? (() => performance.now());
  const fetchImpl = options.fetchImpl ?? fetch;
  const runId = options.runId ?? randomUUID();
  const fetchHtml = options.fetchHtml ?? defaultFetchHtml(fetchImpl);

  if (persistResults && !options.tenantId) {
    throw new Error(
      "runEvaluators: tenantId is required when persistResults !== false (RLS scope must be set)",
    );
  }

  // Memoising fetchHtml so multiple evaluators share one network round-trip.
  // Cache key is the URL string the evaluator asked for, not the final URL,
  // so a redirect chain still de-duplicates against the original request.
  const htmlCache = new Map<
    string,
    Promise<{ html: string; finalUrl: string; status: number }>
  >();
  const cachedFetchHtml: AuditContext["fetchHtml"] = (url) => {
    let pending = htmlCache.get(url);
    if (!pending) {
      pending = fetchHtml(url);
      htmlCache.set(url, pending);
    }
    return pending;
  };

  const ctx: AuditContext = {
    fetchHtml: cachedFetchHtml,
    runId,
    now,
    ...(options.llm ? { llm: options.llm } : {}),
  };

  const startedAt = new Date();

  // Persist the run row up-front so it's visible while evaluators are still
  // executing. Status="running" so a polling UI can show progress.
  if (persistResults && options.tenantId) {
    const tenantId = options.tenantId;
    const db = dbPool();
    await withTenant(db, tenantId, async (tx) => {
      await tx.insert(lrsRuns).values({
        id: runId,
        tenantId,
        targetUrl: target.url,
        status: "running",
        startedAt,
      });
    });
  }

  // 60s budget enforcement (LRC-01). The shared `partial` array is mutated
  // by workers as evaluators complete, so when the deadline trips we still
  // see the rows that ran in time.
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const partial: Array<EvalResult | undefined> = new Array(evaluators.length);
  let results: EvalResult[] = [];
  let summary: RunSummary;
  try {
    const fanout = runWithConcurrency(evaluators, target, ctx, concurrency, partial);
    if (budgetMs > 0) {
      const deadline = new Promise<"timeout">((resolve) => {
        const t = setTimeout(() => resolve("timeout"), budgetMs);
        t.unref?.();
      });
      const race = await Promise.race([fanout.then(() => "done" as const), deadline]);
      if (race === "timeout") {
        // Synthesise harness_timeout rows ONLY for evaluators with no result
        // yet. Already-completed evaluators keep their real verdict.
        results = evaluators.map((e, i) => {
          const done = partial[i];
          if (done) return done;
          return {
            evaluatorId: e.id,
            severity: "fail",
            score: 0,
            latencyMs: budgetMs,
            costUsdMicros: 0,
            evidenceJson: { error: "harness_timeout", budgetMs },
            fixActionMarkdown: `Evaluator \`${e.id}\` exceeded the ${budgetMs}ms audit budget. Re-run; if it persists, raise the budget or split the evaluator.`,
          };
        });
      } else {
        results = partial.filter((r): r is EvalResult => r !== undefined);
      }
    } else {
      await fanout;
      results = partial.filter((r): r is EvalResult => r !== undefined);
    }
    summary = summarise(results);
  } catch (err) {
    // runWithConcurrency itself shouldn't throw (runOne swallows), but if it
    // does we still want to mark the run as failed in the DB.
    if (persistResults && options.tenantId) {
      const tenantId = options.tenantId;
      const db = dbPool();
      await withTenant(db, tenantId, async (tx) => {
        await tx
          .update(lrsRuns)
          .set({ status: "failed", finishedAt: new Date() })
          .where(eq(lrsRuns.id, runId));
      });
    }
    throw err;
  }

  if (persistResults && options.tenantId) {
    const tenantId = options.tenantId;
    const db = dbPool();
    await withTenant(db, tenantId, async (tx) => {
      if (results.length > 0) {
        await tx.insert(lrsResults).values(
          results.map((r) => ({
            runId,
            evaluatorId: r.evaluatorId,
            severity: r.severity,
            score: r.score,
            evidenceJson: r.evidenceJson,
            fixActionMarkdown: r.fixActionMarkdown,
            latencyMs: r.latencyMs,
            costUsdMicros: r.costUsdMicros,
          })),
        );
      }
      await tx
        .update(lrsRuns)
        .set({
          status: "completed",
          summaryJson: summary as unknown as Record<string, unknown>,
          finishedAt: new Date(),
        })
        .where(eq(lrsRuns.id, runId));
    });
  }

  return { runId, results, summary };
}
