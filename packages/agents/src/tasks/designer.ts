import { z } from "zod";
import { baseAgentPayload, defineAgent, type AgentHelpers } from "../runtime";

// designer agent — generateHeroImage Trigger task.
//
// Purpose: produce hero/OG-card images for orchestration use cases (per-launch
// blog post heroes, OG-card variants per customer, etc.). The marketing-site
// banner is build-time (apps/web/scripts/fetch-hero-banner.mjs); this task
// covers everything ELSE that wants a banner-shaped image at runtime.
//
// Why Pollinations.ai:
// - Free, no API key, no account. Matches the "no new outbound vendors that
//   need keys" non-negotiable.
// - Same URL contract as the build-time script — one mental model across the
//   codebase.
// - Cost is 0 micros. We still pass it through agent_runs so the run is
//   observable (and so a future provider swap doesn't break the cost shape).
//
// Why we DON'T write to apps/web/public from here:
// - The marketing-site banner is locked at build time. A trigger task writing
//   into the build output would race the deploy and produce non-deterministic
//   site content. Save destinations are the caller's problem (e.g. R2 upload,
//   per-tenant storage). This task returns the bytes + URL; caller persists.
//
// Out-of-scope (parent ticket: hero banner + LLM default):
// - Image variants (small/medium/og/twitter). Add a sibling task when needed.
// - In-app on-demand UI to drive this — not in MVP.

export const designerPayloadSchema = baseAgentPayload.extend({
  /** The image-generation prompt. Verbatim, URL-encoded by us. */
  prompt: z.string().min(1).max(2000),
  /** Deterministic integer seed. Same (prompt, seed) ⇒ same image. */
  seed: z.number().int().nonnegative().optional(),
  /** Output width in px. Defaults to 1600 (matches the marketing-site banner). */
  width: z.number().int().min(64).max(4096).optional(),
  /** Output height in px. Defaults to 900. */
  height: z.number().int().min(64).max(4096).optional(),
  /** Free-form hint for the caller's storage layer. Not used by this task —
   *  echoed back in the result so callers can correlate. */
  savePathHint: z.string().min(1).max(500).optional(),
});

export type DesignerPayload = z.infer<typeof designerPayloadSchema>;

export type DesignerOutput = {
  /** Final URL after redirects (Pollinations CDN). */
  url: string;
  /** Byte length of the fetched image. */
  imageBytes: number;
  /** The prompt actually sent (echoed for log correlation). */
  prompt: string;
  /** The seed actually used. Defaulted if the caller omitted it. */
  seed: number;
  /** Width/height actually used. */
  width: number;
  height: number;
  /** Echo of the caller's savePathHint, if any. */
  savePathHint?: string;
};

const POLLINATIONS_BASE = "https://image.pollinations.ai/prompt";
const FETCH_TIMEOUT_MS = 30_000;
const MIN_BYTES = 50 * 1024;
const DEFAULT_SEED = 7042;
const DEFAULT_WIDTH = 1600;
const DEFAULT_HEIGHT = 900;

/** Build the Pollinations URL. Exported for tests so we can assert encoding. */
export function buildPollinationsUrl(input: {
  prompt: string;
  seed: number;
  width: number;
  height: number;
}): string {
  const { prompt, seed, width, height } = input;
  return (
    `${POLLINATIONS_BASE}/${encodeURIComponent(prompt)}` +
    `?width=${width}&height=${height}&nologo=true&seed=${seed}`
  );
}

function isImageContentType(ct: string | null): boolean {
  if (!ct) return false;
  const lower = ct.toLowerCase();
  return (
    lower.startsWith("image/png") ||
    lower.startsWith("image/jpeg") ||
    lower.startsWith("image/jpg")
  );
}

/**
 * Pure run body. Takes `helpers` directly so tests can pass a stub.
 * Pattern mirrors runHelloAgent.
 *
 * No LLM calls — Pollinations is a direct image-gen endpoint. We still log
 * via helpers.logEvent so the agent_runs row gets correlated structured logs.
 */
export async function runDesignerAgent(
  payload: DesignerPayload,
  helpers: AgentHelpers,
  meta: { agentRunId: string; triggerRunId: string; tenantId: string },
): Promise<DesignerOutput> {
  const seed = payload.seed ?? DEFAULT_SEED;
  const width = payload.width ?? DEFAULT_WIDTH;
  const height = payload.height ?? DEFAULT_HEIGHT;
  const url = buildPollinationsUrl({ prompt: payload.prompt, seed, width, height });

  helpers.logEvent({
    source: "agents.designer",
    level: "info",
    message: "designer_fetch_start",
    url,
    seed,
    width,
    height,
    agentRunId: meta.agentRunId,
    triggerRunId: meta.triggerRunId,
    tenantId: meta.tenantId,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(
      `designer: pollinations responded ${response.status} ${response.statusText}`,
    );
  }
  const contentType = response.headers.get("content-type");
  if (!isImageContentType(contentType)) {
    throw new Error(
      `designer: unexpected content-type "${contentType ?? "(none)"}" — expected image/png or image/jpeg`,
    );
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength < MIN_BYTES) {
    throw new Error(
      `designer: image too small (${bytes.byteLength}B < ${MIN_BYTES}B floor)`,
    );
  }

  helpers.logEvent({
    source: "agents.designer",
    level: "info",
    message: "designer_fetch_ok",
    bytes: bytes.byteLength,
    contentType,
    seed,
    agentRunId: meta.agentRunId,
    triggerRunId: meta.triggerRunId,
    tenantId: meta.tenantId,
  });

  return {
    url: response.url || url,
    imageBytes: bytes.byteLength,
    prompt: payload.prompt,
    seed,
    width,
    height,
    ...(payload.savePathHint ? { savePathHint: payload.savePathHint } : {}),
  };
}

export const generateHeroImage = defineAgent({
  name: "designer-generate-hero-image",
  schema: designerPayloadSchema,
  run: async (payload, runCtx) => {
    return runDesignerAgent(payload, runCtx.helpers, {
      agentRunId: runCtx.agentRunId,
      triggerRunId: runCtx.triggerRunId,
      tenantId: runCtx.tenantId,
    });
  },
});
