// LRC-01 PR6 — anonymous audit-run persistence helpers.
//
// Two responsibilities:
//   1. `persistAnonymousRun()`  — best-effort write of one lrs_runs row +
//      one lrs_results row per evaluator. tenant_id is NULL (anonymous).
//   2. `loadRunById()` — reads the same shape back, used by both the
//      /api/audit/[runId] route and the /audit/[runId] page.
//
// All errors are caught and logged; persistence failure NEVER surfaces to
// the user-facing flow. The inline /api/audit response is the source of
// truth for the live audit; the DB row is just for the permalink.

import { eq } from "drizzle-orm";
import { lrsRuns, lrsResults } from "@launchwings/db";
import type { EvalResult } from "@launchwings/lrs";
import { getDbOrSkip } from "./db-optional";

export type StoredAuditSummary = {
  pass: number;
  warn: number;
  fail: number;
  score: number;
  error?: string;
  status?: number;
};

export type StoredAuditPayload = {
  ok: true;
  runId: string;
  finishedAt: string;
  targetUrl: string;
  summary: StoredAuditSummary;
  results: EvalResult[];
};

export async function persistAnonymousRun(opts: {
  runId: string;
  targetUrl: string;
  startedAt: Date;
  finishedAt: Date;
  summary: StoredAuditSummary;
  results: EvalResult[];
}): Promise<void> {
  const db = getDbOrSkip("audit");
  if (!db) return;
  try {
    const status = opts.summary.error ? "failed" : "completed";
    await db.insert(lrsRuns).values({
      id: opts.runId,
      tenantId: null,
      targetUrl: opts.targetUrl,
      status,
      summaryJson: opts.summary,
      startedAt: opts.startedAt,
      finishedAt: opts.finishedAt,
    });

    if (opts.results.length > 0) {
      await db.insert(lrsResults).values(
        opts.results.map((r) => ({
          runId: opts.runId,
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
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        level: "warn",
        source: "audit",
        message: "db_persist_failed",
        runId: opts.runId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

export async function loadRunById(runId: string): Promise<StoredAuditPayload | null> {
  const db = getDbOrSkip("audit");
  if (!db) return null;
  try {
    const runs = await db
      .select({
        id: lrsRuns.id,
        targetUrl: lrsRuns.targetUrl,
        summaryJson: lrsRuns.summaryJson,
        finishedAt: lrsRuns.finishedAt,
      })
      .from(lrsRuns)
      .where(eq(lrsRuns.id, runId))
      .limit(1);

    const run = runs[0];
    if (!run) return null;

    const rows = await db
      .select({
        evaluatorId: lrsResults.evaluatorId,
        severity: lrsResults.severity,
        score: lrsResults.score,
        evidenceJson: lrsResults.evidenceJson,
        fixActionMarkdown: lrsResults.fixActionMarkdown,
        latencyMs: lrsResults.latencyMs,
        costUsdMicros: lrsResults.costUsdMicros,
      })
      .from(lrsResults)
      .where(eq(lrsResults.runId, runId));

    const results: EvalResult[] = rows.map((r) => ({
      evaluatorId: r.evaluatorId,
      severity: r.severity,
      score: r.score,
      latencyMs: r.latencyMs ?? 0,
      costUsdMicros: r.costUsdMicros,
      evidenceJson: (r.evidenceJson ?? {}) as Record<string, unknown>,
      fixActionMarkdown: r.fixActionMarkdown ?? "",
    }));

    const summary = (run.summaryJson ?? {
      pass: 0,
      warn: 0,
      fail: 0,
      score: 0,
    }) as StoredAuditSummary;

    return {
      ok: true,
      runId: run.id,
      targetUrl: run.targetUrl,
      finishedAt: (run.finishedAt ?? new Date()).toISOString(),
      summary,
      results,
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        level: "warn",
        source: "audit",
        message: "db_load_failed",
        runId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return null;
  }
}
