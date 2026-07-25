// ---------------------------------------------------------------------------
// Cassette layer for llm() — SETUP-05.
//
// Implements three modes via LLM_CASSETTE_MODE env var:
//
//   - "off" (default in dev): pass-through. llm() makes real network calls.
//   - "record": every llm() call inside withCassette(name, ...) writes a JSON
//     line to packages/agents/cassettes/<name>.jsonl. The recorded line
//     captures the request shape (provider, model, messagesHash) plus the full
//     response. We hash the prompt with sha256 so cassettes don't carry PII.
//   - "replay" (default in CI): every llm() call inside withCassette(name, ...)
//     reads the next matching line from the cassette file and returns the
//     recorded response. NO network call. NO API key needed.
//
// File format: one JSON object per line ("JSONL"). Stable key order so diffs
// review cleanly. The `tag` field is optional metadata for the recording
// session — handy if you want to grep cassettes for a specific evaluator run.
//
// Ordering semantics in replay: cassette playback is positional. The Nth call
// inside withCassette() returns the Nth line. We do NOT match-by-hash because
// if the prompt changes the test SHOULD fail loudly with a hash mismatch.
//
// Why a global interceptor instead of dependency-injection: every call site —
// llm() inside an agent body, llm() inside a deeply nested helper — must be
// caught. Threading an `llm` arg through every helper adds friction we don't
// want in evaluator code. The interceptor is set/cleared inside withCassette
// using try/finally so concurrency-within-test is bounded by the test runner
// itself (vitest's default isolate=process is sufficient).
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, appendFileSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  __setLLMInterceptor,
  type LLMRequest,
  type LLMResponse,
  type ModelId,
} from "../llm";

export type CassetteMode = "off" | "record" | "replay";

export function getCassetteMode(): CassetteMode {
  const raw = process.env.LLM_CASSETTE_MODE;
  if (raw === "record" || raw === "replay" || raw === "off") return raw;
  // Default: in CI we want replay (deterministic, key-free). Locally we want
  // off (real calls when keys are set, errors otherwise — an honest signal).
  // We treat CI=true as the discriminator because every CI runner exports it.
  return process.env.CI ? "replay" : "off";
}

// ---- File location -------------------------------------------------------

// Resolve cassette dir relative to this source file. `import.meta.url` in ESM
// gives us the file path; we walk up to packages/agents and join /cassettes.
// This works whether tsx runs us from src/ or vitest runs us from a test.
const HERE = dirname(fileURLToPath(import.meta.url));
// HERE is .../packages/agents/src/cassettes — go up 2 to packages/agents.
export const CASSETTE_ROOT = join(HERE, "..", "..", "cassettes");

function cassettePath(name: string): string {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name)) {
    throw new Error(`cassette name "${name}" must be filesystem-safe (alphanum, dot, dash, underscore).`);
  }
  return join(CASSETTE_ROOT, `${name}.jsonl`);
}

// ---- Hashing -------------------------------------------------------------

/**
 * Hash a request's messages with sha256. Stable across runs given the same
 * input — JSON.stringify is sufficient because we control the LLMMessage
 * shape (no nondeterministic keys).
 *
 * Includes the system prompt and message array. Excludes tuning knobs like
 * temperature so a flake-free temperature change doesn't invalidate every
 * cassette. If you want to discriminate on those, add them here.
 */
export function hashMessages(req: LLMRequest): string {
  const canonical = JSON.stringify({
    system: req.system ?? null,
    messages: req.messages,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

// ---- File line shape -----------------------------------------------------

interface CassetteLine {
  tag?: string;
  request: {
    provider: string;
    model: ModelId;
    messagesHash: string;
  };
  response: {
    text: string;
    costUsdMicros: number;
    modelUsed: ModelId;
    latencyMs: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
}

function modelProvider(model: ModelId): string {
  const idx = model.indexOf(":");
  return idx > 0 ? model.slice(0, idx) : "unknown";
}

// ---- withCassette --------------------------------------------------------

/**
 * Wrap a block of test/agent code in a cassette scope. The mode is read from
 * env at call time, so a single test file can set process.env.LLM_CASSETTE_MODE
 * before invoking and have the right behaviour.
 *
 * In `record` mode the cassette file is OVERWRITTEN at the start of the
 * scope. This avoids stale lines accumulating across re-records. If you want
 * append-only recording, file a follow-up.
 *
 * In `replay` mode the file must exist and contain at least as many lines as
 * llm() calls within the scope, with matching messagesHash per line. Mismatch
 * throws — that's the signal that a prompt drifted.
 */
export async function withCassette<T>(
  name: string,
  fn: () => Promise<T>,
  opts: { tag?: string } = {},
): Promise<T> {
  const mode = getCassetteMode();
  const path = cassettePath(name);

  if (mode === "off") {
    return fn();
  }

  if (mode === "record") {
    mkdirSync(CASSETTE_ROOT, { recursive: true });
    // Truncate so re-recording produces a clean file.
    writeFileSync(path, "");
    __setLLMInterceptor(async (req: LLMRequest): Promise<LLMResponse> => {
      // Defer to the real implementation by clearing the interceptor for the
      // duration of the live call. Using a stash + try/finally so re-entrancy
      // (an llm() call that itself spawns more llm() calls) is bounded.
      __setLLMInterceptor(null);
      let live: LLMResponse;
      try {
        const { llm } = await import("../llm");
        live = await llm(req);
      } finally {
        // Re-install ourselves for the next call in this scope.
        __setLLMInterceptor(recordInterceptor(path, opts.tag));
      }
      writeRecordedLine(path, req, live, opts.tag);
      return live;
    });
    try {
      return await fn();
    } finally {
      __setLLMInterceptor(null);
    }
  }

  // mode === "replay"
  if (!existsSync(path)) {
    throw new Error(
      `cassette "${name}" not found at ${path}. ` +
        `Re-record with LLM_CASSETTE_MODE=record before running tests.`,
    );
  }
  const lines = readFileSync(path, "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  let cursor = 0;
  __setLLMInterceptor(async (req: LLMRequest): Promise<LLMResponse> => {
    if (cursor >= lines.length) {
      throw new Error(
        `cassette "${name}" exhausted at call #${cursor + 1}. ` +
          `Recorded ${lines.length} call(s); replay tried more. Re-record.`,
      );
    }
    const raw = lines[cursor]!;
    cursor++;
    let parsed: CassetteLine;
    try {
      parsed = JSON.parse(raw) as CassetteLine;
    } catch (err) {
      throw new Error(
        `cassette "${name}" line ${cursor} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const expectedHash = hashMessages(req);
    if (parsed.request.messagesHash !== expectedHash) {
      throw new Error(
        `cassette "${name}" line ${cursor} hash mismatch: ` +
          `recorded=${parsed.request.messagesHash} got=${expectedHash}. ` +
          `The prompt drifted; re-record the cassette.`,
      );
    }
    return {
      text: parsed.response.text,
      costUsdMicros: parsed.response.costUsdMicros,
      modelUsed: parsed.response.modelUsed,
      latencyMs: parsed.response.latencyMs,
      inputTokens: parsed.response.inputTokens,
      outputTokens: parsed.response.outputTokens,
      cacheReadTokens: parsed.response.cacheReadTokens,
      cacheWriteTokens: parsed.response.cacheWriteTokens,
    };
  });
  try {
    return await fn();
  } finally {
    __setLLMInterceptor(null);
  }
}

function recordInterceptor(path: string, tag: string | undefined) {
  return async (req: LLMRequest): Promise<LLMResponse> => {
    __setLLMInterceptor(null);
    let live: LLMResponse;
    try {
      const { llm } = await import("../llm");
      live = await llm(req);
    } finally {
      __setLLMInterceptor(recordInterceptor(path, tag));
    }
    writeRecordedLine(path, req, live, tag);
    return live;
  };
}

function writeRecordedLine(
  path: string,
  req: LLMRequest,
  res: LLMResponse,
  tag: string | undefined,
): void {
  const line: CassetteLine = {
    ...(tag ? { tag } : {}),
    request: {
      provider: modelProvider(req.model),
      model: req.model,
      messagesHash: hashMessages(req),
    },
    response: {
      text: res.text,
      costUsdMicros: res.costUsdMicros,
      modelUsed: res.modelUsed,
      latencyMs: res.latencyMs,
      inputTokens: res.inputTokens,
      outputTokens: res.outputTokens,
      ...(res.cacheReadTokens != null ? { cacheReadTokens: res.cacheReadTokens } : {}),
      ...(res.cacheWriteTokens != null ? { cacheWriteTokens: res.cacheWriteTokens } : {}),
    },
  };
  appendFileSync(path, JSON.stringify(line) + "\n");
}
