// ---------------------------------------------------------------------------
// llm() — provider-agnostic LLM wrapper. SETUP-05.
//
// Single surface so every agent in the repo routes here. The wrapper owns:
//   - Provider routing via a `provider:model` string. Adding a new provider
//     is one branch in this file; no caller-side changes.
//   - Per-model cost computation in micros (1 USD = 1_000_000 micros) so we
//     can store as bigint without floating-point drift. Source date for the
//     price table is documented next to the constant.
//   - Anthropic prompt caching ON by default — system prompt + tool defs both
//     get `cache_control: { type: "ephemeral" }`. The pattern mirrors the
//     repo's `claude-api` skill (not present in-tree at SETUP-05; we follow
//     the canonical Anthropic Messages API caching shape from
//     https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching).
//   - Single-line JSON structured logs per LaunchWings convention. Every
//     successful call emits one line with `{provider, model, costUsdMicros,
//     latencyMs, inputTokens, outputTokens}` so we can SUM on Axiom.
//   - Typed errors. `LLMConfigError` (missing key, bad model string) is
//     distinct from `LLMProviderError` (network/4xx/5xx from upstream) so
//     evaluator code can decide what to retry.
//
// Out of scope for this ticket (per SETUP-05 ticket "Out of scope"):
//   - Streaming. Add later — the cassette layer would need rework for it.
//   - Multi-tool roundtrips inside a single llm() call. Single-turn only.
//   - BYOK. SPRINT_01 SETUP-05 mentions BYOK but the wedge case is internal
//     keys; tenant-level overrides will be a follow-up via an opts.byokKey.
// ---------------------------------------------------------------------------

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

// ---- Public types ---------------------------------------------------------

/** Provider:model string. Add new union members when wiring a new provider. */
export type ModelId =
  | "anthropic:claude-sonnet-4-6"
  | "anthropic:claude-haiku-4-5"
  | "openai:gpt-5"
  | "openai:gpt-4o-mini";

export type LLMRole = "system" | "user" | "assistant";

export interface LLMMessage {
  role: LLMRole;
  content: string;
}

export interface LLMRequest {
  model: ModelId;
  messages: LLMMessage[];
  /** Optional system override; if not set, a system message in `messages` is used (Anthropic-style). */
  system?: string;
  /** Hard cap on output tokens. Defaults to 1024. */
  maxOutputTokens?: number;
  /** Sampling temperature. Defaults to 0.2 (deterministic-ish). */
  temperature?: number;
  /** Disable Anthropic prompt caching for this single call. Default ON. */
  disableCache?: boolean;
}

export interface LLMResponse {
  /** The assistant text content. Single-turn, single-block. */
  text: string;
  /** Cost in micro-USD (1_000_000 per dollar). bigint-safe; we use number for now since values stay <2^53. */
  costUsdMicros: number;
  /** The model that actually served the call (mirrors request unless we add fallbacks). */
  modelUsed: ModelId;
  /** Wall-clock latency in ms, measured around the network call. */
  latencyMs: number;
  /** Token accounting echoed for callers that want to track separately. */
  inputTokens: number;
  outputTokens: number;
  /** Anthropic-only: cache hit/write tokens. Present for observability; may be 0 on OpenAI. */
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  /**
   * OpenAI-only: `choices[0].finish_reason` from the Chat Completions response.
   * Useful for diagnosing budget exhaustion on reasoning models — when a
   * reasoning model burns its `max_completion_tokens` on hidden reasoning
   * tokens, finish_reason="length" with `text===""`. Undefined for Anthropic.
   */
  finishReason?: string;
  /**
   * OpenAI reasoning-model only: `usage.completion_tokens_details.reasoning_tokens`.
   * Counts hidden reasoning tokens, which are billed AND count against
   * `max_completion_tokens`. Undefined for non-reasoning OpenAI calls and for
   * Anthropic.
   */
  reasoningTokens?: number;
  /**
   * Raw provider response. Avoid relying on this — kept for debugging and the
   * cassette recorder, which serialises it for replay. Treat as opaque.
   */
  raw?: unknown;
}

// ---- Errors ---------------------------------------------------------------

export class LLMConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LLMConfigError";
  }
}

export class LLMProviderError extends Error {
  readonly provider: string;
  readonly status?: number;
  constructor(provider: string, message: string, status?: number) {
    super(message);
    this.name = "LLMProviderError";
    this.provider = provider;
    this.status = status;
  }
}

// ---- Pricing table --------------------------------------------------------

// Source: anthropic.com/pricing and openai.com/pricing as of 2026-05-07.
// Values are USD per 1M tokens. Update with a comment + the date when prices
// change; do NOT silently bump. We keep this hard-coded (not env-config'd)
// because cost telemetry has to survive a deploy with a fresh env.
//
// Anthropic cache pricing (per Anthropic docs as of the same date):
//   - cacheWrite: 1.25x base input price (5-min ephemeral cache)
//   - cacheRead:  0.10x base input price
// We compute these from `inputPer1M` to avoid drift between cells.

interface PriceRow {
  /** USD per 1M input tokens (uncached). */
  inputPer1M: number;
  /** USD per 1M output tokens. */
  outputPer1M: number;
}

const PRICING: Record<ModelId, PriceRow> = {
  // Anthropic — placeholders aligned to the 2026 Sonnet/Haiku tier published rates.
  // If you bump these, update the comment date on the file header.
  "anthropic:claude-sonnet-4-6": { inputPer1M: 3, outputPer1M: 15 },
  "anthropic:claude-haiku-4-5": { inputPer1M: 1, outputPer1M: 5 },
  // OpenAI — placeholder aligned to gpt-5 published rate.
  "openai:gpt-5": { inputPer1M: 5, outputPer1M: 15 },
  // gpt-4o-mini — fallback when gpt-5 isn't available on the account / region.
  // Per openai.com/pricing as of 2026-05-07: $0.15 / 1M in, $0.60 / 1M out.
  "openai:gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.6 },
};

const MICROS_PER_USD = 1_000_000;

/**
 * Internal headroom added to `max_completion_tokens` for OpenAI reasoning
 * models (gpt-5, o-series). Per OpenAI's reasoning-models docs
 * (https://platform.openai.com/docs/guides/reasoning, "Allocating space for
 * reasoning"), `max_completion_tokens` caps reasoning + visible output
 * combined; if the cap is too tight the model spends it all on hidden
 * reasoning and returns `content === ""` with `finish_reason === "length"`.
 *
 * 8k tokens is generous enough for `reasoning_effort: "low"` on the structured-
 * JSON extraction tasks we use (Discovery, Positioning) — well above typical
 * reasoning-token spend for `reasoning_effort: "low"`. We also pin
 * `reasoning_effort: "low"` for these calls (see callOpenAI) since deep
 * reasoning yields no quality benefit for JSON-shape extraction. Callers'
 * `maxOutputTokens` continues to mean "visible output cap"; the headroom is
 * added internally and is not visible to callers.
 */
const REASONING_TOKEN_HEADROOM = 8192;

/**
 * Compute cost in micro-USD given token counts.
 *
 * Anthropic cache accounting:
 *   - inputTokens here is "non-cached" input — the regular billable input.
 *   - cacheWriteTokens billed at 1.25x base input.
 *   - cacheReadTokens billed at 0.10x base input.
 *
 * Returned value is rounded to the nearest micro (i.e. 6 decimal-USD places).
 */
export function computeCostUsdMicros(args: {
  model: ModelId;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens?: number;
  cacheReadTokens?: number;
}): number {
  const price = PRICING[args.model];
  const inputCost = (args.inputTokens / 1_000_000) * price.inputPer1M;
  const outputCost = (args.outputTokens / 1_000_000) * price.outputPer1M;
  const cacheWriteCost = args.cacheWriteTokens
    ? (args.cacheWriteTokens / 1_000_000) * price.inputPer1M * 1.25
    : 0;
  const cacheReadCost = args.cacheReadTokens
    ? (args.cacheReadTokens / 1_000_000) * price.inputPer1M * 0.1
    : 0;
  const totalUsd = inputCost + outputCost + cacheWriteCost + cacheReadCost;
  return Math.round(totalUsd * MICROS_PER_USD);
}

// ---- Provider parsing -----------------------------------------------------

type Provider = "anthropic" | "openai";

function parseModel(modelId: ModelId): { provider: Provider; model: string } {
  const idx = modelId.indexOf(":");
  if (idx <= 0) {
    throw new LLMConfigError(
      `llm: model id "${modelId}" must be of shape "provider:model".`,
    );
  }
  const provider = modelId.slice(0, idx);
  const model = modelId.slice(idx + 1);
  if (provider !== "anthropic" && provider !== "openai") {
    throw new LLMConfigError(`llm: unknown provider "${provider}" in model id "${modelId}".`);
  }
  return { provider, model };
}

// ---- Logging helper -------------------------------------------------------

function logJson(line: Record<string, unknown>): void {
  // Single-line JSON, per repo convention. Use console.log so vitest's stdout
  // capture during cassette tests doesn't swallow it.
  console.log(JSON.stringify({ source: "agents-llm", ...line }));
}

// ---- Cassette-injected dispatch hook -------------------------------------

/**
 * The cassette layer (src/cassettes/record.ts) installs a global interceptor by
 * setting __LLM_INTERCEPTOR. When set, llm() calls into it INSTEAD of the live
 * provider. This is the seam that lets `replay` mode return recorded responses
 * without keys / network. Kept module-private; only `cassettes/record.ts`
 * touches it via `setLLMInterceptor`.
 */
type LLMInterceptor = (req: LLMRequest) => Promise<LLMResponse>;

let activeInterceptor: LLMInterceptor | null = null;

/** @internal — used by cassette layer only. Do not call from agent code. */
export function __setLLMInterceptor(fn: LLMInterceptor | null): void {
  activeInterceptor = fn;
}

// ---- Default-model selection ---------------------------------------------

/**
 * Founder authorization (2026-05-08): use OpenAI for now (Anthropic later).
 * The default-model helper centralises the routing logic so callers don't
 * hard-code a model id and silently break when only one provider key is set.
 *
 * Routing rules (in priority order):
 *
 *   1. If OPENAI_API_KEY is set and ANTHROPIC_API_KEY is NOT, default to
 *      `openai:gpt-5`. If gpt-5 isn't your tier, set
 *      `LLM_OPENAI_DEFAULT_MODEL=openai:gpt-4o-mini` to override.
 *   2. If ANTHROPIC_API_KEY is set and OPENAI_API_KEY is NOT, default to
 *      `anthropic:claude-haiku-4-5` (matches the SETUP-05 default).
 *   3. If BOTH keys are set, prefer OpenAI for cost-tracked runs (founder's
 *      explicit ask). Caller can pass `preferredProvider` to override.
 *   4. If NEITHER key is set, throw `LLMConfigError`.
 *
 * The `preferredProvider` argument is a soft hint — we honour it if that
 * provider has a key, otherwise we fall through to whatever IS available.
 * That means a caller asking for "anthropic" on an OpenAI-only deploy gets
 * the OpenAI default rather than an exception, which is the right behaviour
 * for opportunistic LLM-judge code paths (see hero-llm-judge.ts).
 */
export function pickAvailableModel(preferredProvider?: Provider): ModelId {
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);

  if (!hasAnthropic && !hasOpenAI) {
    throw new LLMConfigError(
      "llm: no provider key configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.",
    );
  }

  // Honour the caller's hint when that provider is available.
  if (preferredProvider === "anthropic" && hasAnthropic) {
    return "anthropic:claude-haiku-4-5";
  }
  if (preferredProvider === "openai" && hasOpenAI) {
    return openaiDefaultModel();
  }

  // No hint (or hint can't be honoured): apply the founder's routing.
  // OpenAI wins when both are set OR when only OpenAI is set.
  if (hasOpenAI) return openaiDefaultModel();
  return "anthropic:claude-haiku-4-5";
}

function openaiDefaultModel(): ModelId {
  // Allow an env override so a deploy without gpt-5 access can pin to mini.
  // Validation: must be one of the OpenAI ModelIds we know about.
  const override = process.env.LLM_OPENAI_DEFAULT_MODEL;
  if (override === "openai:gpt-5" || override === "openai:gpt-4o-mini") {
    return override;
  }
  return "openai:gpt-5";
}

/**
 * Pick a "strong" reasoning model for agents that explicitly want Sonnet-class
 * quality (Discovery, Positioning) but should still degrade gracefully to
 * OpenAI when only OPENAI_API_KEY is configured.
 *
 *   1. ANTHROPIC_API_KEY present → `anthropic:claude-sonnet-4-6`.
 *   2. OPENAI_API_KEY present → `openai:gpt-5` (or `LLM_OPENAI_DEFAULT_MODEL`).
 *   3. Neither → throws LLMConfigError.
 */
export function pickStrongModel(): ModelId {
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  if (!hasAnthropic && !hasOpenAI) {
    throw new LLMConfigError(
      "llm: no provider key configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.",
    );
  }
  if (hasAnthropic) return "anthropic:claude-sonnet-4-6";
  return openaiDefaultModel();
}

// ---- Core entrypoint ------------------------------------------------------

/**
 * Make an LLM call. Returns text + cost telemetry.
 *
 * The function is intentionally narrow: we want every agent to converge on
 * the same surface. If you find yourself reaching for raw SDK calls, file a
 * follow-up to extend `LLMRequest` instead.
 */
export async function llm(req: LLMRequest): Promise<LLMResponse> {
  // Cassette interception happens BEFORE any API key check so that replay-mode
  // CI runs with no keys configured. This is exactly the SETUP-05 acceptance:
  // "CI runs in replay mode without keys".
  if (activeInterceptor) {
    return activeInterceptor(req);
  }

  const { provider } = parseModel(req.model);
  const startedAt = Date.now();

  try {
    if (provider === "anthropic") {
      return await callAnthropic(req, startedAt);
    }
    return await callOpenAI(req, startedAt);
  } catch (err) {
    // Re-wrap unknown errors as provider errors, but pass typed errors through.
    if (err instanceof LLMConfigError || err instanceof LLMProviderError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new LLMProviderError(provider, message);
  }
}

// ---- Anthropic --------------------------------------------------------

async function callAnthropic(req: LLMRequest, startedAt: number): Promise<LLMResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new LLMConfigError(
      "llm: ANTHROPIC_API_KEY is not set; cannot call anthropic provider. " +
        "Set the env var or use cassette replay mode in tests.",
    );
  }

  const { model } = parseModel(req.model);
  const client = new Anthropic({ apiKey });

  // Split system and conversation per Anthropic conventions. If `system` is
  // set on the request, use it; otherwise pull a leading "system" message from
  // `messages`. Mid-stream system messages are not supported — fail loudly.
  const { systemText, conversation } = splitSystem(req);

  // Prompt caching: ON by default. Set cache_control: ephemeral on the system
  // prompt so the next call within 5 minutes gets a cache hit on the prefix.
  // Per Anthropic docs the cache breakpoint must be on the LAST element of
  // the cached prefix. For a single-system-block setup that's just the system.
  const useCache = !req.disableCache && systemText.length > 0;
  const systemBlocks = systemText
    ? useCache
      ? [
          {
            type: "text" as const,
            text: systemText,
            cache_control: { type: "ephemeral" as const },
          },
        ]
      : [{ type: "text" as const, text: systemText }]
    : undefined;

  let response: Anthropic.Messages.Message;
  try {
    response = await client.messages.create({
      model,
      max_tokens: req.maxOutputTokens ?? 1024,
      temperature: req.temperature ?? 0.2,
      system: systemBlocks,
      messages: conversation.map((m) => ({
        role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: m.content,
      })),
    });
  } catch (err) {
    const status =
      err && typeof err === "object" && "status" in err && typeof err.status === "number"
        ? err.status
        : undefined;
    const message = err instanceof Error ? err.message : String(err);
    throw new LLMProviderError("anthropic", message, status);
  }

  // Single-block text extraction. Anthropic's content is an array of blocks;
  // for our single-turn surface we expect [{ type: "text", text }] and join
  // any additional text blocks. Tool-use blocks are not in scope (see header).
  const text = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const inputTokens = response.usage.input_tokens ?? 0;
  const outputTokens = response.usage.output_tokens ?? 0;
  const cacheReadTokens = response.usage.cache_read_input_tokens ?? 0;
  const cacheWriteTokens = response.usage.cache_creation_input_tokens ?? 0;

  const costUsdMicros = computeCostUsdMicros({
    model: req.model,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
  });

  const latencyMs = Date.now() - startedAt;

  logJson({
    level: "info",
    message: "llm_call_ok",
    provider: "anthropic",
    model,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    costUsdMicros,
    latencyMs,
  });

  return {
    text,
    costUsdMicros,
    modelUsed: req.model,
    latencyMs,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    raw: response,
  };
}

// ---- OpenAI -----------------------------------------------------------

async function callOpenAI(req: LLMRequest, startedAt: number): Promise<LLMResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new LLMConfigError(
      "llm: OPENAI_API_KEY is not set; cannot call openai provider. " +
        "Set the env var or use cassette replay mode in tests.",
    );
  }

  const { model } = parseModel(req.model);
  const client = new OpenAI({ apiKey });

  const { systemText, conversation } = splitSystem(req);
  // OpenAI Chat Completions accepts a system message as a regular message at
  // the top of the array. We don't add cache_control — OpenAI handles prefix
  // caching server-side automatically and exposes it via usage_details.
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
  if (systemText) messages.push({ role: "system", content: systemText });
  for (const m of conversation) {
    messages.push({ role: m.role === "assistant" ? "assistant" : "user", content: m.content });
  }

  // OpenAI reasoning models (gpt-5, o1/o3/o4 series) only accept the default
  // temperature of 1; passing any other value yields HTTP 400
  // "Only the default (1) value is supported". Strip the field for those
  // models so callers (Discovery, Positioning, etc.) that hard-code a low
  // temperature don't blow up when pickStrongModel() degrades to OpenAI.
  // gpt-4o-mini and other non-reasoning OpenAI models honour the param
  // normally, so we gate the strip on model name.
  const isReasoningModel = /^(gpt-5|o\d)/.test(model);
  // For OpenAI reasoning models `max_completion_tokens` is the COMBINED cap on
  // hidden reasoning tokens + visible output tokens. Per OpenAI's reasoning-
  // models docs (https://platform.openai.com/docs/guides/reasoning,
  // "Allocating space for reasoning"), reasoning tokens count against
  // `max_completion_tokens` and a too-tight cap leaves `content === ""` with
  // `finish_reason === "length"`. Callers like discovery (`maxOutputTokens:
  // 2048`) and positioning (`maxOutputTokens: 1500`) set the *visible-output*
  // budget; we add internal headroom so reasoning tokens don't starve the
  // visible reply. 8k headroom + `reasoning_effort: "low"` covers structured-
  // JSON extraction tasks comfortably without quality loss.
  const params: Parameters<typeof client.chat.completions.create>[0] = {
    model,
    messages,
    max_completion_tokens: isReasoningModel
      ? (req.maxOutputTokens ?? 1024) + REASONING_TOKEN_HEADROOM
      : (req.maxOutputTokens ?? 1024),
  };
  if (!isReasoningModel) {
    params.temperature = req.temperature ?? 0.2;
  } else {
    // Cap reasoning spend for structured-JSON tasks. The supported union on
    // openai@6.37.0 is 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
    // (resources/shared.d.ts). 'low' gets reliable visible output without the
    // multi-thousand-token reasoning bursts that exhaust the budget.
    params.reasoning_effort = "low";
  }

  let completion: Awaited<ReturnType<typeof client.chat.completions.create>>;
  try {
    completion = await client.chat.completions.create(params);
  } catch (err) {
    const status =
      err && typeof err === "object" && "status" in err && typeof err.status === "number"
        ? err.status
        : undefined;
    const message = err instanceof Error ? err.message : String(err);
    throw new LLMProviderError("openai", message, status);
  }

  // Narrow: chat.completions.create with stream:false returns a ChatCompletion.
  // The SDK's union surfaces ChatCompletionChunk only when stream:true; we
  // never set that flag so the cast is sound.
  const choice = "choices" in completion ? completion.choices[0] : undefined;
  const text = choice?.message?.content ?? "";
  const finishReason = choice?.finish_reason;
  const usage = "usage" in completion ? completion.usage : undefined;
  const inputTokens = usage?.prompt_tokens ?? 0;
  const outputTokens = usage?.completion_tokens ?? 0;
  const cacheReadTokens = usage?.prompt_tokens_details?.cached_tokens ?? 0;
  // Reasoning models (gpt-5, o-series) populate
  // `usage.completion_tokens_details.reasoning_tokens`. Non-reasoning models
  // omit it. We surface it on LLMResponse so parse-failure telemetry can
  // attribute empty content to reasoning-token budget exhaustion.
  const reasoningTokens =
    usage?.completion_tokens_details?.reasoning_tokens ?? undefined;

  const costUsdMicros = computeCostUsdMicros({
    model: req.model,
    inputTokens,
    outputTokens,
    cacheReadTokens,
  });

  const latencyMs = Date.now() - startedAt;

  logJson({
    level: "info",
    message: "llm_call_ok",
    provider: "openai",
    model,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    costUsdMicros,
    latencyMs,
    finishReason,
    reasoningTokens,
  });

  return {
    text,
    costUsdMicros,
    modelUsed: req.model,
    latencyMs,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    ...(finishReason !== undefined ? { finishReason } : {}),
    ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
    raw: completion,
  };
}

// ---- Helpers --------------------------------------------------------------

function splitSystem(req: LLMRequest): { systemText: string; conversation: LLMMessage[] } {
  const explicit = req.system?.trim();
  // If req.system is set, just use it verbatim.
  if (explicit) {
    const conv = req.messages.filter((m) => m.role !== "system");
    if (conv.length !== req.messages.length) {
      throw new LLMConfigError(
        "llm: req.system was set AND req.messages contained a 'system' message. " +
          "Pick one — req.system OR a leading system in messages.",
      );
    }
    return { systemText: explicit, conversation: conv };
  }
  // Otherwise: a leading system message in `messages` becomes the system text.
  // Mid-stream `role: "system"` is rejected — Anthropic doesn't support it
  // and OpenAI's behaviour is undefined.
  const out: LLMMessage[] = [];
  let systemText = "";
  for (let i = 0; i < req.messages.length; i++) {
    const m = req.messages[i]!;
    if (m.role === "system") {
      if (i !== 0) {
        throw new LLMConfigError(
          "llm: 'system' messages may only appear as the first message. " +
            "Found one at index " + i + ".",
        );
      }
      systemText = m.content;
      continue;
    }
    out.push(m);
  }
  return { systemText, conversation: out };
}
