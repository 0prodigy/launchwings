// F2 PR2 — Insight Agent.
//
// VISION.md: "An Insight Agent surfaces what's working and recommends the next
// move." This is the GPT-era differentiation vs every static analytics
// dashboard — a daily LLM judgment pass over the tenant's own data that picks
// the ONE thing the founder should do next.
//
// Flow:
//   1. Gather a KPI snapshot for the tenant — counts of recent audits, drafts
//      by status, agent runs by status, optional directory submissions (table
//      may not exist yet), recent waitlist signups (waitlist is global —
//      counted only if at least one tenant-scoped product matches by url).
//   2. Run an LLM judgment pass with a system prompt that demands a structured
//      `{headline, recommendationMd}` object. Validate with zod.
//   3. On the first parse/validation failure, retry once. Second failure ->
//      record a degraded brief with a generic recommendation and warn.
//   4. UPSERT one row in insight_daily_briefs keyed on (tenantId, briefFor).
//      Re-running the task for the same UTC day overwrites in place.
//
// All DB reads happen on the RLS-scoped `tx` from defineAgent so the
// per-tenant counts are guaranteed isolated. The waitlist table has no
// tenant_id column (global signup), so the snapshot reports recent signups
// across ALL tenants — for v1 that's an acceptable proxy because we have one
// landing page (a future enhancement is per-product attribution).

import { count, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import {
  agentRuns,
  insightDailyBriefs,
  lrsRuns,
  socialDrafts,
  waitlist,
} from "@launchwings/db";
import type { DbPool } from "@launchwings/db";
import { baseAgentPayload, defineAgent, type AgentHelpers } from "../runtime";
import type { LLMRequest, ModelId } from "../llm";

// ----- Payload schema ------------------------------------------------------

export const insightPayloadSchema = baseAgentPayload.extend({
  // UTC date string. Cron passes today's date; tests pass deterministic dates.
  briefFor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type InsightPayload = z.infer<typeof insightPayloadSchema>;

// ----- KPI snapshot --------------------------------------------------------

export interface KpiSnapshot {
  /** Audit (lrs_runs) count in the last 7 days. */
  audits: number;
  /** Social drafts in status="draft" (awaiting founder approval). */
  draftsPending: number;
  /** Directory submissions in queued/pending status. -1 = table not present. */
  submissionsQueued: number;
  /** Paying customers — null until billing wires up. Reserved for the LLM. */
  paying: number | null;
  /** Recent waitlist signups (last 7 days; global — see header). */
  signups: number;
  /** Recent agent_runs grouped by status (last 7 days). */
  agentRuns: {
    succeeded: number;
    failed: number;
    running: number;
  };
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Gather KPIs from the tenant-scoped tx. Fails soft on the directory
 * submissions table (it doesn't exist yet — we'll add the schema when the
 * directory-submitter agent lands; until then the count is -1 sentinel).
 */
export async function gatherKpis(
  tx: Pick<DbPool, "select" | "execute">,
  helpers: AgentHelpers,
): Promise<KpiSnapshot> {
  const since = new Date(Date.now() - SEVEN_DAYS_MS);

  // Audits in the last 7 days.
  const auditRows = await tx
    .select({ c: count() })
    .from(lrsRuns)
    .where(gte(lrsRuns.createdAt, since));
  const audits = Number(auditRows[0]?.c ?? 0);

  // Drafts pending review.
  const draftRows = await tx
    .select({ c: count() })
    .from(socialDrafts)
    .where(eq(socialDrafts.status, "draft"));
  const draftsPending = Number(draftRows[0]?.c ?? 0);

  // Agent runs by status, last 7 days.
  const agentRows = await tx
    .select({ status: agentRuns.status, c: count() })
    .from(agentRuns)
    .where(gte(agentRuns.createdAt, since))
    .groupBy(agentRuns.status);
  const agentByStatus: Record<string, number> = {};
  for (const r of agentRows) {
    agentByStatus[r.status] = Number(r.c);
  }

  // Waitlist signups in the last 7 days. NOTE: waitlist has no tenant_id; this
  // count is global. v1 has a single landing page so the figure is
  // representative; will be revisited when per-product attribution lands.
  let signups = 0;
  try {
    const signupRows = await tx
      .select({ c: count() })
      .from(waitlist)
      .where(gte(waitlist.createdAt, since));
    signups = Number(signupRows[0]?.c ?? 0);
  } catch (err) {
    helpers.logEvent({
      level: "warn",
      source: "agents.insight",
      message: "insight_signups_query_failed",
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Directory submissions table may not exist yet. Try a probe; if it 42P01s,
  // we record -1 and move on.
  let submissionsQueued = -1;
  try {
    const probe = await tx.execute(
      sql`SELECT count(*)::int AS c FROM "directory_submissions" WHERE status IN ('queued','pending')`,
    );
    // drizzle returns a `{ rows: [{ c }] }` shape on raw execute; tolerate both.
    const rows = (probe as unknown as { rows?: Array<{ c: number }> }).rows
      ?? (Array.isArray(probe) ? (probe as Array<{ c: number }>) : []);
    if (rows[0]?.c != null) submissionsQueued = Number(rows[0].c);
  } catch (err) {
    // Most likely 42P01 ("relation does not exist") on pre-PR2 deploys.
    helpers.logEvent({
      level: "info",
      source: "agents.insight",
      message: "insight_directory_submissions_skipped",
      reason: err instanceof Error ? err.message : String(err),
    });
  }

  return {
    audits,
    draftsPending,
    submissionsQueued,
    paying: null,
    signups,
    agentRuns: {
      succeeded: agentByStatus.succeeded ?? 0,
      failed: agentByStatus.failed ?? 0,
      running: agentByStatus.running ?? 0,
    },
  };
}

// ----- LLM output schema ---------------------------------------------------

export const insightLlmOutputSchema = z.object({
  headline: z.string().min(1).max(300),
  recommendationMd: z.string().min(1).max(4000),
});

export type InsightLlmOutput = z.infer<typeof insightLlmOutputSchema>;

// ----- Prompt construction -------------------------------------------------

export const INSIGHT_SYSTEM_PROMPT = [
  "You are the LaunchWings Insight Agent. Your job is to read a small KPI",
  "snapshot for a solo founder's pre-launch / early-launch product and decide",
  "the ONE thing they should do today. Not a list. Not a roadmap. One thing.",
  "",
  "Hard rules:",
  "- Output VALID JSON only. No prose, no code fences, no explanation.",
  "- Shape: {\"headline\": string, \"recommendationMd\": string}.",
  "- The headline is one sentence, plain text, under 200 chars.",
  "- The recommendationMd is 1-2 short paragraphs of markdown. Cite specific",
  "  numbers from the snapshot. Be concrete: name the action, name the",
  "  expected outcome.",
  "- Do not invent metrics that aren't in the snapshot. If a number is null,",
  "  say so plainly (e.g. \"no paying customers yet\"); do not guess.",
  "- Founder voice: lowercase OK, terse, no hype words like 'amazing',",
  "  'revolutionary', 'leverage', 'synergy'. No exclamation marks.",
  "- Do not reference internal artefacts (vision.md, prd.md, ADRs, ticket ids).",
  "",
  "Decision priority (pick the FIRST that applies):",
  "1. drafts pending approval > 0 -> push the founder to review/approve them.",
  "2. submissions queued > 0 -> push follow-up on the queued submissions.",
  "3. audits == 0 in last 7 days -> push the founder to run an audit on their",
  "   own landing page.",
  "4. signups > 0 but no paying -> push the founder to email recent signups",
  "   for a 5-minute call (qualitative signal beats more top-of-funnel).",
  "5. paying > 0 -> push retention work (talk to a paying customer this week).",
  "6. else -> push the founder to ship one new piece of build-in-public copy.",
].join("\n");

export function buildInsightUserMessage(input: {
  briefFor: string;
  kpis: KpiSnapshot;
}): string {
  const { briefFor, kpis } = input;
  // Stable line order — cassette hashes depend on this exact text.
  const submissionsLine =
    kpis.submissionsQueued < 0
      ? "- submissionsQueued: (table not present on this deploy)"
      : `- submissionsQueued: ${kpis.submissionsQueued}`;
  return [
    `Date (UTC): ${briefFor}`,
    ``,
    `KPI snapshot (last 7 days unless noted):`,
    `- audits: ${kpis.audits}`,
    `- draftsPending: ${kpis.draftsPending}`,
    submissionsLine,
    `- paying: ${kpis.paying === null ? "null" : kpis.paying}`,
    `- signups: ${kpis.signups}`,
    `- agentRuns: succeeded=${kpis.agentRuns.succeeded}, failed=${kpis.agentRuns.failed}, running=${kpis.agentRuns.running}`,
    ``,
    `Return ONLY the JSON object as specified by the system prompt.`,
  ].join("\n");
}

// ----- Output parsing ------------------------------------------------------

function tryParseInsightOutput(raw: string): InsightLlmOutput | null {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  try {
    const json: unknown = JSON.parse(text);
    return insightLlmOutputSchema.parse(json);
  } catch {
    return null;
  }
}

// ----- Degraded fallback ---------------------------------------------------

/**
 * What to record when the LLM fails twice. Spec calls for a generic
 * recommendation; we make it actionable and number-cited so the founder UI
 * still has something usable. The agent emits a `level: "warn"` log line.
 */
export function buildDegradedBrief(kpis: KpiSnapshot): InsightLlmOutput {
  const parts: string[] = [];
  if (kpis.draftsPending > 0) {
    parts.push(
      `${kpis.draftsPending} social draft${kpis.draftsPending === 1 ? "" : "s"} are pending your review — open the drafts list and approve or reject each one.`,
    );
  } else if (kpis.audits === 0) {
    parts.push(
      `no audits in the last 7 days — run an audit on your landing page to surface anything that broke this week.`,
    );
  } else if (kpis.signups > 0) {
    parts.push(
      `${kpis.signups} new waitlist signup${kpis.signups === 1 ? "" : "s"} this week — email one of them today and ask for 15 minutes on a call.`,
    );
  } else {
    parts.push(
      `nothing urgent in the snapshot — ship one short build-in-public post about what you worked on yesterday.`,
    );
  }
  const headline = parts[0]!.split(" — ")[0]!.replace(/^./, (c) => c);
  return {
    headline,
    recommendationMd: parts.join(" "),
  };
}

// ----- Public output type --------------------------------------------------

export interface InsightOutput {
  agentRunId: string;
  briefId: string;
  briefFor: string;
  headline: string;
  recommendationMd: string;
  kpis: KpiSnapshot;
  degraded: boolean;
}

// ----- Pure run body (testable) -------------------------------------------

/**
 * Pure run body. Mirrors runSocialDraftAgent's shape so unit tests can pass a
 * stub tx that implements just `select` / `execute` / `insert` / `onConflict`
 * via the chained drizzle-orm api.
 */
export async function runInsightAgent(
  payload: InsightPayload,
  helpers: AgentHelpers,
  meta: {
    agentRunId: string;
    triggerRunId: string;
    tenantId: string;
    /** RLS-scoped tx from defineAgent. Tests pass a minimal mock. */
    tx: DbPool;
    /** Override KPI gather for tests that don't want to mock every drizzle method. */
    gather?: (tx: DbPool, helpers: AgentHelpers) => Promise<KpiSnapshot>;
    /** LLM model id. Defaults to pickAvailableModel("openai") on the trigger path. */
    model: ModelId;
  },
): Promise<InsightOutput> {
  const { briefFor } = payload;

  helpers.logEvent({
    level: "info",
    source: "agents.insight",
    message: "insight_start",
    briefFor,
    agentRunId: meta.agentRunId,
    triggerRunId: meta.triggerRunId,
    tenantId: meta.tenantId,
  });

  const kpis = await (meta.gather ?? gatherKpis)(meta.tx, helpers);

  helpers.logEvent({
    level: "info",
    source: "agents.insight",
    message: "insight_kpis_gathered",
    kpis,
  });

  // ---- LLM judgment pass with one retry on parse/validation failure -----

  const userMessage = buildInsightUserMessage({ briefFor, kpis });

  const firstReq: LLMRequest = {
    model: meta.model,
    system: INSIGHT_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
    maxOutputTokens: 800,
    temperature: 0.3,
  };
  const firstResp = await helpers.llm(firstReq);
  let parsed = tryParseInsightOutput(firstResp.text);
  let degraded = false;

  if (!parsed) {
    helpers.logEvent({
      level: "warn",
      source: "agents.insight",
      message: "insight_parse_failed_retrying",
    });
    const retryReq: LLMRequest = {
      model: meta.model,
      system: INSIGHT_SYSTEM_PROMPT,
      messages: [
        { role: "user", content: userMessage },
        { role: "assistant", content: firstResp.text },
        {
          role: "user",
          content:
            "Your last response failed to parse as valid JSON matching {headline, recommendationMd}. Return ONLY the JSON object, no prose, no code fences.",
        },
      ],
      maxOutputTokens: 800,
      temperature: 0.2,
    };
    const retryResp = await helpers.llm(retryReq);
    parsed = tryParseInsightOutput(retryResp.text);
    if (!parsed) {
      helpers.logEvent({
        level: "warn",
        source: "agents.insight",
        message: "insight_degraded_fallback",
      });
      parsed = buildDegradedBrief(kpis);
      degraded = true;
    }
  }

  // ---- Upsert: ON CONFLICT (tenant_id, brief_for) DO UPDATE -------------

  const inserted = await meta.tx
    .insert(insightDailyBriefs)
    .values({
      tenantId: meta.tenantId,
      agentRunId: meta.agentRunId,
      briefFor,
      headline: parsed.headline,
      recommendationMd: parsed.recommendationMd,
      kpisJson: kpis as unknown as Record<string, unknown>,
    })
    .onConflictDoUpdate({
      target: [insightDailyBriefs.tenantId, insightDailyBriefs.briefFor],
      set: {
        agentRunId: meta.agentRunId,
        headline: parsed.headline,
        recommendationMd: parsed.recommendationMd,
        kpisJson: kpis as unknown as Record<string, unknown>,
        // Re-running clears `read_at` since the brief content changed.
        readAt: null,
      },
    })
    .returning({ id: insightDailyBriefs.id });

  const row = inserted[0];
  if (!row) {
    throw new Error("insight: upsert returned no row");
  }

  helpers.logEvent({
    level: "info",
    source: "agents.insight",
    message: "insight_persisted",
    briefId: row.id,
    degraded,
  });

  return {
    agentRunId: meta.agentRunId,
    briefId: row.id,
    briefFor,
    headline: parsed.headline,
    recommendationMd: parsed.recommendationMd,
    kpis,
    degraded,
  };
}

// ----- Trigger.dev task ----------------------------------------------------

export const insightDailyBrief = defineAgent({
  name: "insight-daily-brief",
  schema: insightPayloadSchema,
  run: async (payload, runCtx) => {
    // Lazy import so cassette-replay tests that import this module don't need
    // OPENAI_API_KEY at import time. Mirrors socialDraftAgent.
    const { pickAvailableModel } = await import("../llm");
    const model = pickAvailableModel("openai");

    return runInsightAgent(payload, runCtx.helpers, {
      agentRunId: runCtx.agentRunId,
      triggerRunId: runCtx.triggerRunId,
      tenantId: runCtx.tenantId,
      tx: runCtx.tx,
      model,
    });
  },
});
