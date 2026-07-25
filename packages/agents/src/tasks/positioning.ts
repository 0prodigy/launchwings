// ONB-05 — Positioning Agent.
//
// Reads a `products` row whose `metadata.discovery` was populated by ONB-04,
// runs a Sonnet-class draft pass to generate 3 ICPs + 5 taglines, then runs a
// cheaper judge pass (Haiku/gpt-4o-mini-class) over the taglines to compute
// the 4-axis rubric server-side. The model's self-score is REPLACED by the
// reconciled server score (server wins) before persistence.
//
// Cost cap: $0.20 per run, post-call guardrail (we can't abort mid-flight).
//
// Mirrors `tasks/discovery.ts` for structure: zod payload + zod output schema
// + system prompt + deterministic user-message builder + parse-and-retry +
// degraded fallback + persistence inside the RLS-scoped tx.

import { eq } from "drizzle-orm";
import { z } from "zod";
import { products } from "@launchwings/db";
import type { DbPool } from "@launchwings/db";
import {
  baseAgentPayload,
  defineAgent,
  type AgentHelpers,
} from "../runtime";
import type { LLMRequest, ModelId } from "../llm";

// ----- Payload schema ------------------------------------------------------

export const positioningPayloadSchema = baseAgentPayload.extend({
  productId: z.string().uuid(),
  // Optional founder follow-up notes captured by the regenerate UI in T3
  // (brief editor). When present and non-empty, the user-message builder
  // appends a "Founder follow-up notes" block; absent/empty preserves the
  // canonical body so existing cassettes / fixture tests stay valid.
  notes: z.string().max(4000).optional(),
});

export type PositioningPayload = z.infer<typeof positioningPayloadSchema>;

// ----- Typed input error ---------------------------------------------------

/**
 * Thrown when the product row is present but `metadata.discovery` is absent.
 * The trigger.dev worker surfaces this as a failed agent_runs row; the tRPC
 * caller can map it to PRECONDITION_FAILED if it ever decides to await the
 * run inline (today the dispatch is fire-and-forget).
 */
export class PositioningInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PositioningInputError";
  }
}

// ----- Output schema -------------------------------------------------------

const judgeScoreSchema = z.object({
  audience: z.boolean(),
  problem: z.boolean(),
  mechanism: z.boolean(),
  under12: z.boolean(),
  total: z.number().int().min(0).max(4),
});

export const positioningOutputSchema = z.object({
  icps: z
    .array(
      z.object({
        name: z.string().min(2).max(80),
        role: z.string().min(2).max(120),
        pains: z.array(z.string().min(3).max(200)).min(2).max(5),
        gains: z.array(z.string().min(3).max(200)).min(2).max(5),
      }),
    )
    .length(3),
  taglines: z
    .array(
      z.object({
        text: z.string().min(3).max(120),
        judge_score: judgeScoreSchema,
      }),
    )
    .length(5),
});

export type PositioningOutput = z.infer<typeof positioningOutputSchema>;
export type TaglineJudgeScore = z.infer<typeof judgeScoreSchema>;

// ----- System prompt -------------------------------------------------------

export const POSITIONING_SYSTEM_PROMPT = [
  "You are the LaunchWings Positioning Agent. Your job is to read a solo",
  "founder's discovery brief and produce 3 specific ICPs and 5 candidate",
  "taglines for the homepage hero.",
  "",
  "Hard rules:",
  "- Output VALID JSON only. No prose, no code fences, no explanation.",
  "- Match the exact schema described below. All keys required.",
  "- Founder voice: lowercase OK, terse, concrete. No hype words like",
  "  'amazing', 'revolutionary', 'leverage', 'synergy', 'game-changing',",
  "  'cutting-edge'. No exclamation marks.",
  "- Do not reference internal artefacts (vision.md, prd.md, ADRs, ticket ids).",
  "- Do not invent customers, metrics, or claims that aren't supported by the",
  "  discovery brief inputs.",
  "",
  "Output schema (JSON):",
  "{",
  '  "icps": [ { "name": string (2-80), "role": string (2-120),',
  '              "pains": string[] (2..5 items, each 3-200 chars),',
  '              "gains": string[] (2..5 items, each 3-200 chars) } x3 ],',
  '  "taglines": [ { "text": string (3-120),',
  '                  "judge_score": {',
  '                     "audience": boolean,',
  '                     "problem":  boolean,',
  '                     "mechanism": boolean,',
  '                     "under12":  boolean,',
  '                     "total":    int 0-4',
  "                  } } x5 ]",
  "}",
  "",
  "Tagline rubric — score each tagline against these four axes. The SERVER",
  "will RECOMPUTE these scores after you respond and override your values.",
  "Your self-score is a hint; the server's judgment is authoritative.",
  "  (a) audience  — does the tagline name or strongly imply who it's for?",
  "  (b) problem   — does it name or imply the pain it removes?",
  "  (c) mechanism — does it hint at the unique mechanism / wedge?",
  "  (d) under12   — strictly fewer than 12 whitespace-delimited words.",
  "  total = audience + problem + mechanism + under12 (0..4).",
  "",
  "Hard rule on taglines: do NOT emit any tagline that is 12 words or more.",
  "Under-12 is deterministic and the server WILL re-check; emitting a 12+",
  "word tagline guarantees a rejected score. Aim for 5-9 words.",
  "",
  "ICPs must be specific roles, not vague segments (e.g. 'solo SaaS founder",
  "pre-launch' beats 'small business owners'). Pains and gains must be",
  "concrete, grounded in the discovery brief — no generic platitudes.",
].join("\n");

// ----- Prompt body ---------------------------------------------------------

export interface PositioningProductInput {
  url: string | null;
  name: string;
  briefText: string | null;
  metadata: Record<string, unknown> | null;
}

interface DiscoveryShape {
  product_summary: string;
  value_prop: string;
  three_icps: Array<{
    name: string;
    role: string;
    pains: string[];
    gains: string[];
  }>;
  channel_suitability_scores?: Record<string, { score: number; rationale: string }>;
}

function readDiscoveryFromMetadata(
  metadata: Record<string, unknown> | null,
): DiscoveryShape | null {
  if (!metadata) return null;
  const discovery = (metadata.discovery ?? null) as Record<string, unknown> | null;
  if (!discovery) return null;
  const output = (discovery.output ?? null) as DiscoveryShape | null;
  if (!output) return null;
  if (typeof output.product_summary !== "string") return null;
  if (typeof output.value_prop !== "string") return null;
  if (!Array.isArray(output.three_icps)) return null;
  return output;
}

/**
 * Flatten the discovery brief into a deterministic prompt body. Stable line
 * order matters — cassette hashes depend on this exact text. Any new field
 * MUST be appended at the end (not interleaved) so existing cassettes stay
 * valid.
 *
 * Throws `PositioningInputError` if `metadata.discovery` is missing — the
 * positioning agent is only meaningful after Discovery has run.
 */
export function buildPositioningUserMessage(input: {
  product: PositioningProductInput;
  /**
   * Founder follow-up notes from the regenerate UI. When non-empty, appended
   * after the canonical body so existing cassettes stay byte-identical.
   */
  notes?: string;
}): string {
  const { product, notes } = input;
  const discovery = readDiscoveryFromMetadata(product.metadata ?? null);
  if (!discovery) {
    throw new PositioningInputError(
      `positioning: product has no metadata.discovery — run discovery first`,
    );
  }

  const lines: string[] = [
    `Product name: ${product.name}`,
    `URL: ${product.url ?? "(none)"}`,
    ``,
    `Discovery brief:`,
    `- product_summary: ${discovery.product_summary}`,
    `- value_prop: ${discovery.value_prop}`,
    ``,
    `Discovery ICPs:`,
  ];
  for (let i = 0; i < discovery.three_icps.length; i++) {
    const icp = discovery.three_icps[i]!;
    lines.push(`- icp_${i + 1}.name: ${icp.name}`);
    lines.push(`- icp_${i + 1}.role: ${icp.role}`);
    lines.push(`- icp_${i + 1}.pains: ${icp.pains.join(" | ")}`);
    lines.push(`- icp_${i + 1}.gains: ${icp.gains.join(" | ")}`);
  }

  if (discovery.channel_suitability_scores) {
    lines.push(``);
    lines.push(`Channel suitability scores:`);
    // Sort keys for deterministic line order across runs.
    const keys = Object.keys(discovery.channel_suitability_scores).sort();
    for (const k of keys) {
      const v = discovery.channel_suitability_scores[k]!;
      lines.push(`- ${k}: score=${v.score}`);
    }
  }

  lines.push(``);
  lines.push(
    `Return ONLY the JSON object as specified by the system prompt. 3 ICPs + 5 taglines, each tagline strictly under 12 words.`,
  );

  // Append-only — never interleaved — so existing cassette hashes stay valid.
  const trimmedNotes = (notes ?? "").trim();
  if (trimmedNotes.length > 0) {
    lines.push(``);
    lines.push(`Founder follow-up notes (regenerate request):`);
    lines.push(trimmedNotes.slice(0, 4000));
  }

  return lines.join("\n");
}

// ----- Deterministic word-count check --------------------------------------

/**
 * Returns true iff `text` has strictly fewer than 12 whitespace-delimited
 * words. Empty tokens (from collapsed whitespace) don't count. Exported for
 * tests so the contract is locked.
 */
export function scoreTaglineUnder12(text: string): boolean {
  const words = text.trim().split(/\s+/).filter((w) => w.length > 0);
  return words.length < 12;
}

// ----- LLM judge over taglines (cheap pass) --------------------------------

const judgeBatchSchema = z.object({
  results: z
    .array(
      z.object({
        audience: z.boolean(),
        problem: z.boolean(),
        mechanism: z.boolean(),
      }),
    )
    .min(1),
});

interface JudgeBrief {
  product_summary: string;
  value_prop: string;
}

const POSITIONING_JUDGE_SYSTEM_PROMPT = [
  "You are a strict tagline judge for a solo founder's launch positioning.",
  "Given a discovery brief and a list of candidate taglines, score each",
  "tagline against three boolean axes:",
  "  (a) audience  — does the tagline name or strongly imply who it's for?",
  "  (b) problem   — does it name or imply the pain it removes?",
  "  (c) mechanism — does it hint at the unique mechanism / wedge?",
  "Be strict. Vague gestures don't count.",
  "",
  "Output VALID JSON only. No prose, no code fences. Shape:",
  '{ "results": [ { "audience": bool, "problem": bool, "mechanism": bool }, ... ] }',
  "Return one entry per input tagline, in the SAME order they were given.",
].join("\n");

function buildJudgeUserMessage(taglines: string[], brief: JudgeBrief): string {
  const lines = [
    `Discovery brief:`,
    `- product_summary: ${brief.product_summary}`,
    `- value_prop: ${brief.value_prop}`,
    ``,
    `Taglines to judge (in order):`,
  ];
  for (let i = 0; i < taglines.length; i++) {
    lines.push(`${i + 1}. ${taglines[i]}`);
  }
  lines.push(``);
  lines.push(
    `Return ONLY the JSON object {"results": [...]} with one entry per tagline, in order.`,
  );
  return lines.join("\n");
}

function tryParseJudgeBatch(
  raw: string,
  expectedLength: number,
): Array<{ audience: boolean; problem: boolean; mechanism: boolean }> | null {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  try {
    const json: unknown = JSON.parse(text);
    const parsed = judgeBatchSchema.parse(json);
    if (parsed.results.length !== expectedLength) return null;
    return parsed.results;
  } catch {
    return null;
  }
}

/** Same as tryParseJudgeBatch but surfaces the thrown error for telemetry. */
function parseJudgeBatchOrError(
  raw: string,
  expectedLength: number,
):
  | { ok: true; value: Array<{ audience: boolean; problem: boolean; mechanism: boolean }> }
  | { ok: false; error: unknown } {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  try {
    const json: unknown = JSON.parse(text);
    const parsed = judgeBatchSchema.parse(json);
    if (parsed.results.length !== expectedLength) {
      return {
        ok: false,
        error: new Error(
          `judge: results.length=${parsed.results.length} expected ${expectedLength}`,
        ),
      };
    }
    return { ok: true, value: parsed.results };
  } catch (err) {
    return { ok: false, error: err };
  }
}

/**
 * Single LLM call that judges all 5 taglines on the 3 LLM-judgable axes.
 * Uses a cheap model (caller passes a Haiku/mini-class id). Retries once on
 * parse failure; on second failure returns all-false (and warns).
 */
export async function judgeTaglinesBatch(
  taglines: string[],
  brief: JudgeBrief,
  helpers: AgentHelpers,
  model: ModelId,
): Promise<Array<{ audience: boolean; problem: boolean; mechanism: boolean }>> {
  const allFalse = () =>
    taglines.map(() => ({ audience: false, problem: false, mechanism: false }));

  if (taglines.length === 0) return [];

  const userMessage = buildJudgeUserMessage(taglines, brief);
  const baseReq: LLMRequest = {
    model,
    system: POSITIONING_JUDGE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
    maxOutputTokens: 512,
    temperature: 0.1,
  };

  const firstResp = await helpers.llm(baseReq);
  const firstParse = parseJudgeBatchOrError(firstResp.text, taglines.length);
  let parsed = firstParse.ok ? firstParse.value : null;
  if (!parsed) {
    helpers.logEvent({
      level: "warn",
      source: "agents.positioning",
      message: "positioning_judge_parse_fail",
      kind: "positioning_judge_parse_fail",
      attempt: 1,
      finishReason: firstResp.finishReason,
      reasoningTokens: firstResp.reasoningTokens,
      outputTokens: firstResp.outputTokens,
      textLength: firstResp.text.length,
      textPrefix: firstResp.text.slice(0, 500),
      errorMessage: String((firstParse as { error: unknown }).error).slice(0, 500),
    });
    helpers.logEvent({
      level: "warn",
      source: "agents.positioning",
      message: "positioning_judge_parse_failed_retrying",
    });
    const retryResp = await helpers.llm({
      model,
      system: POSITIONING_JUDGE_SYSTEM_PROMPT,
      messages: [
        { role: "user", content: userMessage },
        { role: "assistant", content: firstResp.text },
        {
          role: "user",
          content:
            'Your last response failed to parse. Return ONLY {"results": [...]} with one boolean triple per tagline, no prose, no code fences.',
        },
      ],
      maxOutputTokens: 512,
      temperature: 0.1,
    });
    const retryParse = parseJudgeBatchOrError(retryResp.text, taglines.length);
    parsed = retryParse.ok ? retryParse.value : null;
    if (!parsed) {
      helpers.logEvent({
        level: "warn",
        source: "agents.positioning",
        message: "positioning_judge_parse_fail",
        kind: "positioning_judge_parse_fail",
        attempt: 2,
        finishReason: retryResp.finishReason,
        reasoningTokens: retryResp.reasoningTokens,
        outputTokens: retryResp.outputTokens,
        textLength: retryResp.text.length,
        textPrefix: retryResp.text.slice(0, 500),
        errorMessage: String((retryParse as { error: unknown }).error).slice(0, 500),
      });
      helpers.logEvent({
        level: "warn",
        source: "agents.positioning",
        message: "positioning_judge_degraded_all_false",
      });
      return allFalse();
    }
  }
  return parsed;
}

// ----- Reconcile model self-score with server judge ------------------------

/**
 * Server's judge wins. Builds the final `judge_score` from the LLM-judge
 * booleans (audience/problem/mechanism) plus the deterministic word-count
 * (under12); `total` is the sum and is always consistent with the booleans.
 */
export function reconcileTaglineScore(
  serverJudge: { audience: boolean; problem: boolean; mechanism: boolean },
  under12: boolean,
): TaglineJudgeScore {
  const total =
    (serverJudge.audience ? 1 : 0) +
    (serverJudge.problem ? 1 : 0) +
    (serverJudge.mechanism ? 1 : 0) +
    (under12 ? 1 : 0);
  return {
    audience: serverJudge.audience,
    problem: serverJudge.problem,
    mechanism: serverJudge.mechanism,
    under12,
    total,
  };
}

// ----- Output parsing (draft pass) -----------------------------------------

function tryParsePositioningOutput(raw: string): PositioningOutput | null {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  try {
    const json: unknown = JSON.parse(text);
    return positioningOutputSchema.parse(json);
  } catch {
    return null;
  }
}

/** Same as tryParsePositioningOutput but surfaces the thrown error. */
function parsePositioningOutputOrError(
  raw: string,
): { ok: true; value: PositioningOutput } | { ok: false; error: unknown } {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  try {
    const json: unknown = JSON.parse(text);
    return { ok: true, value: positioningOutputSchema.parse(json) };
  } catch (err) {
    return { ok: false, error: err };
  }
}

// ----- Degraded fallback ---------------------------------------------------

/**
 * Schema-valid placeholder used when both LLM draft attempts fail. The shape
 * is identical to the success path so downstream code can always assume a
 * parsed positioning output. Judge scores are zeroed; the founder UI can
 * surface a "regenerate" prompt against this state.
 */
export function buildDegradedPositioningOutput(): PositioningOutput {
  const placeholderTagline = {
    text: "edit me — positioning fell back, please regenerate.",
    judge_score: {
      audience: false,
      problem: false,
      mechanism: false,
      under12: false,
      total: 0,
    },
  };
  return {
    icps: [1, 2, 3].map((i) => ({
      name: `ICP ${i}`,
      role: "edit me",
      pains: ["edit this pain", "edit this pain too"],
      gains: ["edit this gain", "edit this gain too"],
    })),
    taglines: [
      { ...placeholderTagline },
      { ...placeholderTagline },
      { ...placeholderTagline },
      { ...placeholderTagline },
      { ...placeholderTagline },
    ],
  };
}

// ----- Public output type --------------------------------------------------

export interface PositioningAgentOutput {
  productId: string;
  output: PositioningOutput;
  costUsdMicros: number;
  modelId: ModelId;
  degraded: boolean;
}

// ----- Cost cap ------------------------------------------------------------

/** $0.20 per run, in micro-USD. */
export const POSITIONING_COST_CAP_USD_MICROS = 200_000;

// ----- Pure run body (testable) -------------------------------------------

export async function runPositioningAgent(
  payload: PositioningPayload,
  helpers: AgentHelpers,
  meta: {
    agentRunId: string;
    triggerRunId: string;
    tenantId: string;
    /** RLS-scoped tx from defineAgent. */
    tx: DbPool;
    /** Sonnet-class model id for the draft pass. */
    draftModel: ModelId;
    /** Cheap model id for the judge pass (Haiku / gpt-4o-mini class). */
    judgeModel: ModelId;
  },
): Promise<PositioningAgentOutput> {
  const { productId } = payload;

  helpers.logEvent({
    level: "info",
    source: "agents.positioning",
    message: "positioning_start",
    productId,
    agentRunId: meta.agentRunId,
    triggerRunId: meta.triggerRunId,
    tenantId: meta.tenantId,
  });

  const rows = await meta.tx
    .select()
    .from(products)
    .where(eq(products.id, productId));
  const product = rows[0];
  if (!product) {
    helpers.logEvent({
      level: "error",
      source: "agents.positioning",
      message: "positioning_product_not_found",
      productId,
    });
    throw new Error(`positioning: product ${productId} not found in tenant`);
  }

  const productInput: PositioningProductInput = {
    url: product.url ?? null,
    name: product.name,
    briefText: product.briefText ?? null,
    metadata: (product.metadata ?? {}) as Record<string, unknown>,
  };

  const discovery = readDiscoveryFromMetadata(productInput.metadata);
  if (!discovery) {
    throw new PositioningInputError(
      `positioning: product ${productId} has no metadata.discovery — run discovery first`,
    );
  }

  // ---- Draft pass with one retry on parse/validation failure --------------

  const userMessage = buildPositioningUserMessage({
    product: productInput,
    ...(payload.notes !== undefined ? { notes: payload.notes } : {}),
  });

  const baseReq: LLMRequest = {
    model: meta.draftModel,
    system: POSITIONING_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
    maxOutputTokens: 1500,
    temperature: 0.4,
  };

  const firstResp = await helpers.llm(baseReq);
  let totalCostUsdMicros = firstResp.costUsdMicros;
  const firstParse = parsePositioningOutputOrError(firstResp.text);
  let parsed: PositioningOutput | null = firstParse.ok ? firstParse.value : null;
  let degraded = false;

  if (!parsed) {
    helpers.logEvent({
      level: "warn",
      source: "agents.positioning",
      message: "positioning_parse_fail",
      kind: "positioning_parse_fail",
      attempt: 1,
      finishReason: firstResp.finishReason,
      reasoningTokens: firstResp.reasoningTokens,
      outputTokens: firstResp.outputTokens,
      textLength: firstResp.text.length,
      textPrefix: firstResp.text.slice(0, 500),
      errorMessage: String((firstParse as { error: unknown }).error).slice(0, 500),
    });
    helpers.logEvent({
      level: "warn",
      source: "agents.positioning",
      message: "positioning_parse_failed_retrying",
    });
    const retryResp = await helpers.llm({
      model: meta.draftModel,
      system: POSITIONING_SYSTEM_PROMPT,
      messages: [
        { role: "user", content: userMessage },
        { role: "assistant", content: firstResp.text },
        {
          role: "user",
          content:
            "Your last response failed to parse as valid JSON matching the schema in the system prompt. Return ONLY the JSON object, no prose, no code fences. 3 ICPs and exactly 5 taglines.",
        },
      ],
      maxOutputTokens: 1500,
      temperature: 0.3,
    });
    totalCostUsdMicros += retryResp.costUsdMicros;
    const retryParse = parsePositioningOutputOrError(retryResp.text);
    parsed = retryParse.ok ? retryParse.value : null;
    if (!parsed) {
      helpers.logEvent({
        level: "warn",
        source: "agents.positioning",
        message: "positioning_parse_fail",
        kind: "positioning_parse_fail",
        attempt: 2,
        finishReason: retryResp.finishReason,
        reasoningTokens: retryResp.reasoningTokens,
        outputTokens: retryResp.outputTokens,
        textLength: retryResp.text.length,
        textPrefix: retryResp.text.slice(0, 500),
        errorMessage: String((retryParse as { error: unknown }).error).slice(0, 500),
      });
      helpers.logEvent({
        level: "warn",
        source: "agents.positioning",
        message: "positioning_degraded_fallback",
      });
      parsed = buildDegradedPositioningOutput();
      degraded = true;
    }
  }

  // ---- Server-side judge (only when we have real LLM taglines) -----------
  // For the degraded fallback the judge scores stay zeroed by construction;
  // running the LLM judge over placeholder text would burn money for nothing.
  if (!degraded) {
    const taglineTexts = parsed.taglines.map((t) => t.text);
    const judgeResults = await judgeTaglinesBatch(
      taglineTexts,
      {
        product_summary: discovery.product_summary,
        value_prop: discovery.value_prop,
      },
      helpers,
      meta.judgeModel,
    );
    parsed = {
      ...parsed,
      taglines: parsed.taglines.map((t, i) => {
        const serverJudge = judgeResults[i] ?? {
          audience: false,
          problem: false,
          mechanism: false,
        };
        return {
          text: t.text,
          judge_score: reconcileTaglineScore(
            serverJudge,
            scoreTaglineUnder12(t.text),
          ),
        };
      }),
    };
  }

  // ---- Cost-cap enforcement (guardrail, not fence) -----------------------
  if (totalCostUsdMicros > POSITIONING_COST_CAP_USD_MICROS) {
    helpers.logEvent({
      level: "warn",
      source: "agents.positioning",
      message: "positioning_cost_cap_exceeded",
      costUsdMicros: totalCostUsdMicros,
      capUsdMicros: POSITIONING_COST_CAP_USD_MICROS,
    });
  }

  // ---- Persist into products.metadata.positioning -------------------------
  const currentMetadata =
    (product.metadata ?? {}) as Record<string, unknown>;
  const nextMetadata: Record<string, unknown> = {
    ...currentMetadata,
    positioning: {
      output: parsed,
      degraded,
      costUsdMicros: totalCostUsdMicros,
      modelId: meta.draftModel,
      generatedAt: new Date().toISOString(),
    },
  };

  await meta.tx
    .update(products)
    .set({ metadata: nextMetadata, updatedAt: new Date() })
    .where(eq(products.id, productId));

  helpers.logEvent({
    level: "info",
    source: "agents.positioning",
    message: "positioning_persisted",
    productId,
    degraded,
    costUsdMicros: totalCostUsdMicros,
  });

  return {
    productId,
    output: parsed,
    costUsdMicros: totalCostUsdMicros,
    modelId: meta.draftModel,
    degraded,
  };
}

// ----- Trigger.dev task ----------------------------------------------------

export const positioningAgent = defineAgent({
  name: "positioning-agent",
  schema: positioningPayloadSchema,
  run: async (payload, runCtx) => {
    // Lazy import to mirror discoveryAgent — keeps cassette-replay tests that
    // import this module from needing OPENAI/ANTHROPIC keys at import time.
    const { pickStrongModel, pickAvailableModel } = await import("../llm");
    return runPositioningAgent(payload, runCtx.helpers, {
      agentRunId: runCtx.agentRunId,
      triggerRunId: runCtx.triggerRunId,
      tenantId: runCtx.tenantId,
      tx: runCtx.tx,
      draftModel: pickStrongModel(),
      judgeModel: pickAvailableModel("openai"),
    });
  },
});
