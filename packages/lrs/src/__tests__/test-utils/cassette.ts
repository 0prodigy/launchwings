// Minimal cassette/replay helper for LRS tests.
//
// We deliberately reimplement a tiny JSONL replay loader rather than import
// `withCassette` from `@launchwings/agents`. Two reasons:
//
//   1. PR3's headline change is **breaking the agents↔lrs cycle** via DI. If
//      lrs's tests import from agents (even as a dev-dep) turbo's task graph
//      sees the same cycle re-introduced. The DI seam (`AuditContext.llm`)
//      lets us pass any `LlmFn` here, including a cassette-driven one we
//      assemble locally.
//
//   2. The cassette JSONL format from `packages/agents/src/cassettes/record.ts`
//      is small and stable. We match its on-disk shape so the same files
//      could in principle be re-recorded by the agents recorder later (the
//      `messagesHash` is computed identically). PR3 ships pre-recorded
//      fixtures hand-authored by the AI eng (no record step needed).
//
// Replay semantics: positional. The Nth call returns the Nth line. We DO
// validate the messagesHash so a prompt drift fails the test loudly with a
// clear "cassette out of date" message — same contract as the agents layer.

import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { LlmFn } from "../../types";

const HERE = dirname(fileURLToPath(import.meta.url));
// HERE is .../packages/lrs/src/__tests__/test-utils — go up 3 to packages/lrs.
const CASSETTE_ROOT = join(HERE, "..", "..", "..", "cassettes");

function cassettePath(name: string): string {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name)) {
    throw new Error(`cassette name "${name}" must be filesystem-safe.`);
  }
  return join(CASSETTE_ROOT, `${name}.jsonl`);
}

/** Hash messages identically to packages/agents/src/cassettes/record.ts so
 *  the same fixture format is interoperable. */
function hashMessages(opts: {
  system?: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
}): string {
  const canonical = JSON.stringify({
    system: opts.system ?? null,
    messages: opts.messages,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

interface CassetteLine {
  tag?: string;
  request: {
    provider: string;
    model: string;
    messagesHash: string;
  };
  response: {
    text: string;
    costUsdMicros: number;
    modelUsed: string;
    latencyMs: number;
    inputTokens: number;
    outputTokens: number;
  };
}

/** Build a cassette-driven `LlmFn` that returns the next recorded line on
 *  each call. Throws on hash mismatch (prompt drift) or exhaustion. */
export function cassetteLlm(name: string): LlmFn {
  const path = cassettePath(name);
  if (!existsSync(path)) {
    throw new Error(
      `lrs test cassette "${name}" not found at ${path}. ` +
        `If you changed the hero-judge prompt, re-record the fixture.`,
    );
  }
  const lines = readFileSync(path, "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  let cursor = 0;
  return async (opts) => {
    if (cursor >= lines.length) {
      throw new Error(
        `lrs test cassette "${name}" exhausted at call #${cursor + 1}; ` +
          `recorded ${lines.length} call(s).`,
      );
    }
    const raw = lines[cursor]!;
    cursor++;
    const parsed = JSON.parse(raw) as CassetteLine;
    const expectedHash = hashMessages({
      ...(opts.system !== undefined ? { system: opts.system } : {}),
      messages: opts.messages,
    });
    if (parsed.request.messagesHash !== expectedHash) {
      throw new Error(
        `lrs test cassette "${name}" line ${cursor} hash mismatch: ` +
          `recorded=${parsed.request.messagesHash} got=${expectedHash}. ` +
          `The prompt drifted; re-record the cassette.`,
      );
    }
    return {
      text: parsed.response.text,
      costUsdMicros: parsed.response.costUsdMicros,
      modelUsed: parsed.response.modelUsed,
    };
  };
}

export { hashMessages };
