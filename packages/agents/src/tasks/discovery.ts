// ONB-04 — Discovery Agent (Sonnet).
//
// Reads a `products` row, runs a single Anthropic Sonnet 4.6 pass with prompt
// caching ON (system prompt is cached), validates the JSON output against
// `discoveryOutputSchema`, retries once on parse/validation failure, and
// merges the result into `products.metadata.discovery`.
//
// Cost cap: $0.50 per run. We can't abort a completed Anthropic call mid-flight
// (the bill is incurred at first byte) so the cap is a guardrail — we emit a
// `level: "warn"` log when crossed and still persist the result so the founder
// at least sees output. The hard ceiling is enforced upstream via
// maxOutputTokens + the static system prompt size.
//
// Mirrors `tasks/insight.ts` for structure: zod payload + zod output schema +
// system prompt + deterministic user-message builder + parse-and-retry +
// degraded fallback + persistence inside withTenant.

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

export const discoveryPayloadSchema = baseAgentPayload.extend({
  productId: z.string().uuid(),
  // Optional founder follow-up notes captured by the regenerate UI in T3
  // (brief editor). When present and non-empty, the user-message builder
  // appends a "Founder follow-up notes" block; absent/empty preserves the
  // canonical body so existing cassettes / fixture tests stay valid.
  notes: z.string().max(4000).optional(),
});

export type DiscoveryPayload = z.infer<typeof discoveryPayloadSchema>;

// ----- Output schema -------------------------------------------------------

const channelScoreSchema = z.object({
  score: z.number().int().min(0).max(100),
  rationale: z.string().min(10).max(400),
});

export const discoveryOutputSchema = z.object({
  product_summary: z.string().min(20).max(800),
  value_prop: z.string().min(10).max(300),
  three_icps: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        role: z.string().min(1).max(120),
        pains: z.array(z.string().min(1).max(280)).min(1).max(8),
        gains: z.array(z.string().min(1).max(280)).min(1).max(8),
      }),
    )
    .length(3),
  competitors: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        url: z.string().url().optional(),
        why_they_lose: z.string().min(1).max(400),
      }),
    )
    .min(2)
    .max(5),
  current_seo_posture: z.object({
    title_present: z.boolean(),
    meta_description_present: z.boolean(),
    og_image_present: z.boolean(),
    headline_clarity_score: z.number().int().min(0).max(100),
    notes: z.string().min(1).max(800),
  }),
  channel_suitability_scores: z.object({
    producthunt: channelScoreSchema,
    betalist: channelScoreSchema,
    hackernews: channelScoreSchema,
    reddit: channelScoreSchema,
    twitter: channelScoreSchema,
    linkedin: channelScoreSchema,
  }),
});

export type DiscoveryOutput = z.infer<typeof discoveryOutputSchema>;

// ----- System prompt -------------------------------------------------------

export const DISCOVERY_SYSTEM_PROMPT = [
  "You are the LaunchWings Discovery Agent. Your job is to read a solo",
  "founder's product inputs (URL metadata, free-form brief, extracted",
  "headline) and produce a structured launch brief.",
  "",
  "Hard rules:",
  "- Output VALID JSON only. No prose, no code fences, no explanation.",
  "- Match the exact schema described below. All keys required.",
  "- Founder voice: lowercase OK, terse, concrete. No hype words like",
  "  'amazing', 'revolutionary', 'leverage', 'synergy', 'game-changing',",
  "  'cutting-edge'. No exclamation marks.",
  "- Do not reference internal artefacts (vision.md, prd.md, ADRs, ticket ids).",
  "- Do not invent metrics, customers, or claims that aren't grounded in the",
  "  inputs. If a field is unknowable from the inputs, say so plainly in the",
  "  relevant rationale (e.g. seo_posture.notes: 'no homepage HTML provided').",
  "",
  "Output schema (JSON):",
  "{",
  '  "product_summary": string (20-800 chars; one paragraph; what it is + who',
  "                              it's for + the wedge),",
  '  "value_prop": string (10-300 chars; one sentence the founder could put on',
  "                        the homepage hero),",
  '  "three_icps": [ { "name": string, "role": string,',
  '                    "pains": string[], "gains": string[] } x3 ]',
  "                  (specific role > vague segment; e.g. 'solo SaaS founder",
  "                   pre-launch' beats 'small business owners'),",
  '  "competitors": [ { "name": string, "url"?: string,',
  '                     "why_they_lose": string } x2..5 ]',
  '                  (name 2-5 real or near-real competitors; "why_they_lose"',
  "                   is one sentence on the founder's wedge against them),",
  '  "current_seo_posture": { "title_present": bool,',
  '                           "meta_description_present": bool,',
  '                           "og_image_present": bool,',
  '                           "headline_clarity_score": int 0-100,',
  '                           "notes": string },',
  '  "channel_suitability_scores": {',
  '     "producthunt":  { "score": int 0-100, "rationale": string },',
  '     "betalist":     { "score": int 0-100, "rationale": string },',
  '     "hackernews":   { "score": int 0-100, "rationale": string },',
  '     "reddit":       { "score": int 0-100, "rationale": string },',
  '     "twitter":      { "score": int 0-100, "rationale": string },',
  '     "linkedin":     { "score": int 0-100, "rationale": string }',
  "  }",
  "}",
  "",
  "Channel-scoring rubric (apply these explicitly when assigning scores):",
  "- producthunt: high when the product has a visual demo + clear value prop +",
  "  a polished landing page; low when B2B-internal or no screenshots.",
  "- betalist: high when product is genuinely pre-launch / waitlist phase with",
  "  a polished landing page; low for already-shipped products.",
  "- hackernews: high when there's technical depth, an open-source angle, or a",
  "  novel architecture story; low when pure marketing-site SaaS.",
  "- reddit: high when the audience is a niche community with an obvious",
  "  subreddit fit; low when the audience is broad/generic.",
  "- twitter: high when build-in-public works (consumer or dev tools) and the",
  "  founder can post short demos; low for compliance-heavy or B2B-internal.",
  "- linkedin: high when the audience is B2B operators, ops, sales, RevOps, or",
  "  enterprise IT; low for consumer/indie-dev.",
  "Each rationale must reference one or more of the inputs, not generic claims.",
].join("\n");

// ----- Prompt body ---------------------------------------------------------

export interface DiscoveryProductInput {
  url: string | null;
  name: string;
  briefText: string | null;
  metadata: Record<string, unknown> | null;
}

/**
 * Flatten product inputs into a deterministic prompt body. Stable line order
 * matters — cassette hashes depend on this exact text. Any new input field
 * MUST be appended at the end (not interleaved) so existing cassettes stay
 * valid.
 */
export function buildDiscoveryUserMessage(input: {
  product: DiscoveryProductInput;
  /**
   * Founder follow-up notes from the regenerate UI. When non-empty, an extra
   * "Founder follow-up notes" block is appended after the canonical body so
   * existing cassettes (which omit this field) remain byte-identical.
   */
  notes?: string;
}): string {
  const { product, notes } = input;
  const meta = (product.metadata ?? {}) as Record<string, unknown>;
  const extracted = (meta.extracted ?? {}) as Record<string, unknown>;
  const title = stringOrNull(extracted.title);
  const metaDesc = stringOrNull(extracted.metaDescription);
  const heroHeadline = stringOrNull(extracted.heroHeadline);
  const primaryCta = stringOrNull(extracted.primaryCta);
  const ogImage = boolFromMeta(meta);
  const briefSnippet = (product.briefText ?? "").trim().slice(0, 4000);

  const lines: string[] = [
    `Product name: ${product.name}`,
    `URL: ${product.url ?? "(none)"}`,
    ``,
    `Extracted homepage metadata:`,
    `- title: ${title ?? "(missing)"}`,
    `- meta_description: ${metaDesc ?? "(missing)"}`,
    `- hero_headline: ${heroHeadline ?? "(missing)"}`,
    `- primary_cta: ${primaryCta ?? "(missing)"}`,
    `- og_image_present: ${ogImage ? "true" : "false"}`,
    ``,
    `Founder brief (truncated to 4000 chars):`,
    briefSnippet.length > 0 ? briefSnippet : "(no brief provided)",
    ``,
    `Return ONLY the JSON object as specified by the system prompt.`,
  ];

  // Append-only — never interleaved — so existing cassette hashes stay valid.
  const trimmedNotes = (notes ?? "").trim();
  if (trimmedNotes.length > 0) {
    lines.push(``);
    lines.push(`Founder follow-up notes (regenerate request):`);
    lines.push(trimmedNotes.slice(0, 4000));
  }

  return lines.join("\n");
}

function stringOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function boolFromMeta(meta: Record<string, unknown>): boolean {
  // Try the most common locations the URL importer / future passes write to.
  const screenshot = (meta.screenshot ?? null) as Record<string, unknown> | null;
  if (screenshot && typeof screenshot.ogImagePresent === "boolean") {
    return screenshot.ogImagePresent;
  }
  const extracted = (meta.extracted ?? null) as Record<string, unknown> | null;
  if (extracted && typeof extracted.ogImagePresent === "boolean") {
    return extracted.ogImagePresent;
  }
  return false;
}

// ----- Output parsing ------------------------------------------------------

function tryParseDiscoveryOutput(raw: string): DiscoveryOutput | null {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  try {
    const json: unknown = JSON.parse(text);
    return discoveryOutputSchema.parse(json);
  } catch {
    return null;
  }
}

/**
 * Parse-with-error variant. Returns the parsed output on success or the raw
 * thrown error on failure so callers can include it in a `discovery_parse_fail`
 * log line. The original `tryParseDiscoveryOutput` (null on failure) is kept
 * for compatibility with any external caller; the run body uses this variant.
 */
function parseDiscoveryOutputOrError(
  raw: string,
): { ok: true; value: DiscoveryOutput } | { ok: false; error: unknown } {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  try {
    const json: unknown = JSON.parse(text);
    return { ok: true, value: discoveryOutputSchema.parse(json) };
  } catch (err) {
    return { ok: false, error: err };
  }
}

// ----- Degraded fallback ---------------------------------------------------

/**
 * Minimal but valid `DiscoveryOutput` used when both LLM attempts fail. The
 * shape is identical to the success path so downstream code (UI, ONB-05) can
 * always assume a parsed brief; the founder sees a banner upstream that the
 * brief was degraded and offers a regenerate button.
 */
export function buildDegradedDiscoveryOutput(
  input: DiscoveryProductInput,
): DiscoveryOutput {
  const summarySource =
    (input.briefText ?? "").trim().slice(0, 200) ||
    `${input.name} — automatic discovery failed; founder should edit this brief manually.`;
  const channel = (rationale: string) => ({ score: 50, rationale });
  return {
    product_summary:
      summarySource.length >= 20
        ? summarySource
        : `${input.name}: discovery failed — please edit this brief manually before continuing.`,
    value_prop: `${input.name} (placeholder — edit me).`,
    three_icps: [1, 2, 3].map((i) => ({
      name: `ICP ${i}`,
      role: "edit me",
      pains: ["edit this pain"],
      gains: ["edit this gain"],
    })),
    competitors: [
      { name: "Competitor A", why_they_lose: "edit this — fallback brief." },
      { name: "Competitor B", why_they_lose: "edit this — fallback brief." },
    ],
    current_seo_posture: {
      title_present: false,
      meta_description_present: false,
      og_image_present: false,
      headline_clarity_score: 0,
      notes: "discovery agent fell back to a degraded brief; rerun when ready.",
    },
    channel_suitability_scores: {
      producthunt: channel("fallback — rerun discovery for a real score."),
      betalist: channel("fallback — rerun discovery for a real score."),
      hackernews: channel("fallback — rerun discovery for a real score."),
      reddit: channel("fallback — rerun discovery for a real score."),
      twitter: channel("fallback — rerun discovery for a real score."),
      linkedin: channel("fallback — rerun discovery for a real score."),
    },
  };
}

// ----- Public output type --------------------------------------------------

export interface DiscoveryAgentOutput {
  productId: string;
  output: DiscoveryOutput;
  costUsdMicros: number;
  modelId: ModelId;
  degraded: boolean;
}

// ----- Cost cap ------------------------------------------------------------

/** $0.50 per run, in micro-USD. */
export const DISCOVERY_COST_CAP_USD_MICROS = 500_000;

// ----- Pure run body (testable) -------------------------------------------

export async function runDiscoveryAgent(
  payload: DiscoveryPayload,
  helpers: AgentHelpers,
  meta: {
    agentRunId: string;
    triggerRunId: string;
    tenantId: string;
    /** RLS-scoped tx from defineAgent. */
    tx: DbPool;
    /** LLM model id. Defaults to anthropic:claude-sonnet-4-6 on the trigger path. */
    model: ModelId;
  },
): Promise<DiscoveryAgentOutput> {
  const { productId } = payload;

  helpers.logEvent({
    level: "info",
    source: "agents.discovery",
    message: "discovery_start",
    productId,
    agentRunId: meta.agentRunId,
    triggerRunId: meta.triggerRunId,
    tenantId: meta.tenantId,
  });

  // Read the product row inside the RLS-scoped tx. RLS blocks cross-tenant
  // reads; "not found" here means either the id is wrong or it belongs to a
  // different tenant — same surface in either case.
  const rows = await meta.tx
    .select()
    .from(products)
    .where(eq(products.id, productId));
  const product = rows[0];
  if (!product) {
    helpers.logEvent({
      level: "error",
      source: "agents.discovery",
      message: "discovery_product_not_found",
      productId,
    });
    throw new Error(`discovery: product ${productId} not found in tenant`);
  }

  const productInput: DiscoveryProductInput = {
    url: product.url ?? null,
    name: product.name,
    briefText: product.briefText ?? null,
    metadata: (product.metadata ?? {}) as Record<string, unknown>,
  };

  // ---- LLM pass with one retry on parse/validation failure ----------------

  const userMessage = buildDiscoveryUserMessage({
    product: productInput,
    ...(payload.notes !== undefined ? { notes: payload.notes } : {}),
  });

  const baseReq: LLMRequest = {
    model: meta.model,
    system: DISCOVERY_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
    maxOutputTokens: 2048,
    temperature: 0.2,
  };

  const firstResp = await helpers.llm(baseReq);
  let totalCostUsdMicros = firstResp.costUsdMicros;
  const firstParse = parseDiscoveryOutputOrError(firstResp.text);
  let parsed: DiscoveryOutput | null = firstParse.ok ? firstParse.value : null;
  let degraded = false;

  if (!parsed) {
    // Observability: capture the raw model text + finish_reason + reasoning
    // token spend so we can diagnose budget-exhaustion failures (gpt-5 with a
    // too-tight `max_completion_tokens` returns content="" + finishReason=
    // "length"). The previous bare-catch swallowed this signal.
    helpers.logEvent({
      level: "warn",
      source: "agents.discovery",
      message: "discovery_parse_fail",
      kind: "discovery_parse_fail",
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
      source: "agents.discovery",
      message: "discovery_parse_failed_retrying",
    });
    const retryResp = await helpers.llm({
      model: meta.model,
      system: DISCOVERY_SYSTEM_PROMPT,
      messages: [
        { role: "user", content: userMessage },
        { role: "assistant", content: firstResp.text },
        {
          role: "user",
          content:
            "Your last response failed to parse as valid JSON matching the schema in the system prompt. Return ONLY the JSON object, no prose, no code fences.",
        },
      ],
      maxOutputTokens: 2048,
      temperature: 0.2,
    });
    totalCostUsdMicros += retryResp.costUsdMicros;
    const retryParse = parseDiscoveryOutputOrError(retryResp.text);
    parsed = retryParse.ok ? retryParse.value : null;
    if (!parsed) {
      helpers.logEvent({
        level: "warn",
        source: "agents.discovery",
        message: "discovery_parse_fail",
        kind: "discovery_parse_fail",
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
        source: "agents.discovery",
        message: "discovery_degraded_fallback",
      });
      parsed = buildDegradedDiscoveryOutput(productInput);
      degraded = true;
    }
  }

  // ---- Cost-cap enforcement (guardrail, not fence) ------------------------
  if (totalCostUsdMicros > DISCOVERY_COST_CAP_USD_MICROS) {
    helpers.logEvent({
      level: "warn",
      source: "agents.discovery",
      message: "discovery_cost_cap_exceeded",
      costUsdMicros: totalCostUsdMicros,
      capUsdMicros: DISCOVERY_COST_CAP_USD_MICROS,
    });
  }

  // ---- Persist into products.metadata.discovery ---------------------------
  // Read-modify-write the metadata jsonb. We do this in one round-trip via
  // drizzle's update().set({ metadata: ...}) because Postgres jsonb_set is
  // awkward to express through drizzle's typed surface and the row is small.
  const currentMetadata =
    (product.metadata ?? {}) as Record<string, unknown>;
  const nextMetadata: Record<string, unknown> = {
    ...currentMetadata,
    discovery: {
      output: parsed,
      degraded,
      costUsdMicros: totalCostUsdMicros,
      modelId: meta.model,
      generatedAt: new Date().toISOString(),
    },
  };

  await meta.tx
    .update(products)
    .set({ metadata: nextMetadata, updatedAt: new Date() })
    .where(eq(products.id, productId));

  helpers.logEvent({
    level: "info",
    source: "agents.discovery",
    message: "discovery_persisted",
    productId,
    degraded,
    costUsdMicros: totalCostUsdMicros,
  });

  return {
    productId,
    output: parsed,
    costUsdMicros: totalCostUsdMicros,
    modelId: meta.model,
    degraded,
  };
}

// ----- Trigger.dev task ----------------------------------------------------

export const discoveryAgent = defineAgent({
  name: "discovery-agent",
  schema: discoveryPayloadSchema,
  run: async (payload, runCtx) => {
    // pickStrongModel() prefers Sonnet 4.6 when ANTHROPIC_API_KEY is set, else
    // falls back to OpenAI (gpt-5 or LLM_OPENAI_DEFAULT_MODEL=openai:gpt-4o-mini).
    // Discovery's quality bar is "Sonnet-class"; OpenAI fallback keeps the
    // wedge functional on deploys with only OPENAI_API_KEY.
    const { pickStrongModel } = await import("../llm");
    return runDiscoveryAgent(payload, runCtx.helpers, {
      agentRunId: runCtx.agentRunId,
      triggerRunId: runCtx.triggerRunId,
      tenantId: runCtx.tenantId,
      tx: runCtx.tx,
      model: pickStrongModel(),
    });
  },
});
