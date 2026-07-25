// F2 PR1 — socialDraftAgent.
//
// Generates X / LinkedIn drafts (Reddit / Bluesky / Threads schema-ready but
// not exercised in PR1) in the founder's voice from a product brief.
// Persists each draft into `social_drafts` so the (later) review-and-post UI
// can hand off without re-running the LLM.
//
// Flow per channel:
//   1. Load voice corpus (cached at module level — same docs/dogfood/posts
//      across the run; no need to re-read for each channel).
//   2. Build the system prompt with channel + voice samples.
//   3. Call helpers.llm with a JSON-output instruction.
//   4. Validate with zod. On parse failure, retry once with a "your last
//      response failed to parse" follow-up. Second failure → throw.
//   5. INSERT each draft into social_drafts inside runCtx.tx (already
//      tenant-scoped by defineAgent).
//
// Why retry-once instead of N retries: the second cassette case is "the LLM
// silently broke my JSON". One retry catches the typical drift; more retries
// just spend money. If we need bigger budgets we'll wire it via a payload
// option in PR2.

import { z } from "zod";
import { socialDrafts } from "@launchwings/db";
import { baseAgentPayload, defineAgent, type AgentHelpers } from "../runtime";
import type { LLMRequest, LLMResponse, ModelId } from "../llm";
import {
  buildSocialDraftSystemPrompt,
  CHANNEL_LIMITS,
  loadVoiceCorpus,
  type SocialChannelLiteral,
  type VoiceSample,
} from "../voice";
import type { DbPool } from "@launchwings/db";

// ----- Payload schema ------------------------------------------------------

const channelEnum = z.enum(["x", "linkedin", "reddit", "bluesky", "threads"]);

const productBriefSchema = z.object({
  name: z.string().min(1).max(120),
  oneLiner: z.string().min(1).max(400),
  url: z.string().url().optional(),
  audience: z.string().min(1).max(400),
  valueProp: z.string().min(1).max(800),
  callToAction: z.string().min(1).max(200).optional(),
});

export const socialDraftPayloadSchema = baseAgentPayload.extend({
  productBrief: productBriefSchema,
  channels: z.array(channelEnum).min(1),
  count: z.number().int().min(1).max(5).default(2),
});

export type SocialDraftPayload = z.infer<typeof socialDraftPayloadSchema>;
export type ProductBrief = z.infer<typeof productBriefSchema>;

// ----- LLM output schema ---------------------------------------------------

// Note: we don't enforce charCount === body.length at the zod level — the LLM
// occasionally gets it wrong by 1-2 chars. We re-derive char count from
// body.length on the way to the DB. We DO enforce <= channel limit via a
// .superRefine inside parseAndValidateOutput.
const draftSchema = z.object({
  body: z.string().min(1),
  charCount: z.number().int().nonnegative(),
  hashtags: z.array(z.string().min(1)).max(3).optional(),
  threadIndex: z.number().int().positive().optional(),
});

export const socialDraftOutputSchema = z.object({
  drafts: z.array(draftSchema).min(1).max(5),
});

export type SocialDraftLLMOutput = z.infer<typeof socialDraftOutputSchema>;

// ----- Public output type --------------------------------------------------

export interface PersistedDraft {
  id: string;
  channel: SocialChannelLiteral;
  body: string;
  charCount: number;
}

export interface SocialDraftOutput {
  agentRunId: string;
  drafts: PersistedDraft[];
}

// ----- Helpers -------------------------------------------------------------

function userMessageFor(input: {
  channel: SocialChannelLiteral;
  brief: ProductBrief;
  count: number;
}): string {
  const { channel, brief, count } = input;
  // Stable lines for cassette-replay determinism.
  return [
    `Generate ${count} draft post(s) for channel: ${channel}.`,
    ``,
    `Product name: ${brief.name}`,
    `One-liner: ${brief.oneLiner}`,
    brief.url ? `URL: ${brief.url}` : null,
    `Audience: ${brief.audience}`,
    `Value prop: ${brief.valueProp}`,
    brief.callToAction ? `Call to action: ${brief.callToAction}` : null,
    ``,
    `Return only valid JSON in the shape specified by the system prompt.`,
  ]
    .filter(Boolean)
    .join("\n");
}

function tryParseLLMJson(raw: string): SocialDraftLLMOutput | null {
  // Strip code fences if the LLM ignored instructions and added ```json.
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  try {
    const json: unknown = JSON.parse(text);
    return socialDraftOutputSchema.parse(json);
  } catch {
    return null;
  }
}

function withinLimit(channel: SocialChannelLiteral, body: string): boolean {
  return body.length <= CHANNEL_LIMITS[channel];
}

// ----- Per-channel generation, with one retry ------------------------------

async function generateDraftsForChannel(input: {
  channel: SocialChannelLiteral;
  brief: ProductBrief;
  count: number;
  voiceSamples: VoiceSample[];
  model: ModelId;
  helpers: AgentHelpers;
}): Promise<SocialDraftLLMOutput> {
  const { channel, brief, count, voiceSamples, model, helpers } = input;

  const system = buildSocialDraftSystemPrompt({ channel, voiceSamples });
  const userMessage = userMessageFor({ channel, brief, count });

  const firstReq: LLMRequest = {
    model,
    system,
    messages: [{ role: "user", content: userMessage }],
    maxOutputTokens: 1500,
    temperature: 0.4,
  };
  const firstResp: LLMResponse = await helpers.llm(firstReq);
  let parsed = tryParseLLMJson(firstResp.text);
  let allWithinLimit = parsed?.drafts.every((d) => withinLimit(channel, d.body)) ?? false;

  if (parsed && allWithinLimit) {
    return parsed;
  }

  // Retry once. Include the first response so the model can self-correct.
  helpers.logEvent({
    level: "warn",
    source: "agents.social-draft",
    message: "social_draft_parse_failed_retrying",
    channel,
    parseFailed: parsed === null,
    overLimit: parsed !== null && !allWithinLimit,
  });

  const retryReq: LLMRequest = {
    model,
    system,
    messages: [
      { role: "user", content: userMessage },
      { role: "assistant", content: firstResp.text },
      {
        role: "user",
        content: parsed === null
          ? `Your last response failed to parse as valid JSON matching the required schema. Return ONLY the JSON object, no prose, no code fences.`
          : `Your last response had at least one draft over the ${CHANNEL_LIMITS[channel]}-character limit for ${channel}. Shorten and return ONLY valid JSON.`,
      },
    ],
    maxOutputTokens: 1500,
    temperature: 0.2,
  };
  const retryResp = await helpers.llm(retryReq);
  parsed = tryParseLLMJson(retryResp.text);
  allWithinLimit = parsed?.drafts.every((d) => withinLimit(channel, d.body)) ?? false;
  if (!parsed || !allWithinLimit) {
    throw new Error(
      `social-draft: LLM output failed validation twice for channel "${channel}" (parsed=${parsed !== null}, withinLimit=${allWithinLimit}).`,
    );
  }
  return parsed;
}

// ----- Pure run body (testable) -------------------------------------------

/**
 * Pure run body. Takes helpers + a tx + an agentRunId so unit tests can pass
 * a stub for each. Mirrors runHelloAgent / runDesignerAgent.
 *
 * The tx is expected to be RLS-scoped (defineAgent supplies one inside
 * withTenant). Tests pass an in-memory mock implementing `.insert(...).values(...).returning(...)`.
 */
export async function runSocialDraftAgent(
  payload: SocialDraftPayload,
  helpers: AgentHelpers,
  meta: {
    agentRunId: string;
    triggerRunId: string;
    tenantId: string;
    /** RLS-scoped tx from defineAgent. Tests pass a minimal mock. */
    tx: Pick<DbPool, "insert">;
    /** Loader for voice samples; injected so tests can pass an in-memory list. */
    loadCorpus?: (channel: SocialChannelLiteral) => VoiceSample[];
    /** LLM model id. Defaults to pickAvailableModel("openai") when unset. */
    model: ModelId;
  },
): Promise<SocialDraftOutput> {
  const { productBrief, channels, count } = payload;

  helpers.logEvent({
    level: "info",
    source: "agents.social-draft",
    message: "social_draft_start",
    channels,
    count,
    productName: productBrief.name,
    agentRunId: meta.agentRunId,
    triggerRunId: meta.triggerRunId,
    tenantId: meta.tenantId,
  });

  const corpusByChannel = (channel: SocialChannelLiteral): VoiceSample[] => {
    if (meta.loadCorpus) return meta.loadCorpus(channel);
    // Read with channel-filter first; fall back to unfiltered (the corpus is
    // small enough that mixing channels still produces useful voice signal).
    const filtered = loadVoiceCorpus({ channel, sampleCap: 5 });
    if (filtered.length > 0) return filtered;
    return loadVoiceCorpus({ sampleCap: 5 });
  };

  const persisted: PersistedDraft[] = [];

  for (const channel of channels) {
    const voiceSamples = corpusByChannel(channel);
    const llmOutput = await generateDraftsForChannel({
      channel,
      brief: productBrief,
      count,
      voiceSamples,
      model: meta.model,
      helpers,
    });

    for (const draft of llmOutput.drafts) {
      // Re-derive char count from body.length — the LLM's self-reported number
      // can drift; the DB column is denormalised UI-side, we want it accurate.
      const charCount = draft.body.length;
      const metadataJson: Record<string, unknown> = {};
      if (draft.hashtags && draft.hashtags.length > 0) metadataJson.hashtags = draft.hashtags;
      if (draft.threadIndex != null) metadataJson.threadIndex = draft.threadIndex;

      const inserted = await meta.tx
        .insert(socialDrafts)
        .values({
          tenantId: meta.tenantId,
          agentRunId: meta.agentRunId,
          channel,
          bodyMd: draft.body,
          bodyCharCount: charCount,
          status: "draft" as const,
          metadataJson: Object.keys(metadataJson).length > 0 ? metadataJson : null,
        })
        .returning({ id: socialDrafts.id });

      const row = inserted[0];
      if (!row) {
        throw new Error("social-draft: insert returned no row");
      }
      persisted.push({
        id: row.id,
        channel,
        body: draft.body,
        charCount,
      });
    }

    helpers.logEvent({
      level: "info",
      source: "agents.social-draft",
      message: "social_draft_channel_complete",
      channel,
      drafts: llmOutput.drafts.length,
    });
  }

  return {
    agentRunId: meta.agentRunId,
    drafts: persisted,
  };
}

// ----- Trigger.dev task ---------------------------------------------------

export const socialDraftAgent = defineAgent({
  name: "social-draft",
  schema: socialDraftPayloadSchema,
  run: async (payload, runCtx) => {
    // Lazy import so cassette-replay tests that import this module don't
    // need OPENAI_API_KEY at import time.
    const { pickAvailableModel } = await import("../llm");
    const model = pickAvailableModel("openai");

    return runSocialDraftAgent(payload, runCtx.helpers, {
      agentRunId: runCtx.agentRunId,
      triggerRunId: runCtx.triggerRunId,
      tenantId: runCtx.tenantId,
      tx: runCtx.tx,
      model,
    });
  },
});
