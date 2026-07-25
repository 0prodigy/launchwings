import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { runEvaluators } from "../runner";
import {
  metaDescriptionEvaluator,
  ogImageEvaluator,
} from "../evaluators";
import { RetryableError, type Evaluator, type LlmFn } from "../types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(__dirname, "fixtures/launchwings-index.html");
const FIXTURE_HTML = readFileSync(fixturePath, "utf8");

// In-memory mode (persistResults: false) so we don't need Postgres in CI.
// We feed both evaluators a fixture HTML that simulates the post-fix state of
// launchwings.com (description trimmed to 146 chars per dogfood-LRS-08, and
// og:image pointing at the Next 15 file-convention route which resolves to
// 200 image/png).
//
// The runner test is an integration test for the runner shape itself —
// concurrency, summary aggregation, retry policy. Per-evaluator unit tests
// live alongside the evaluators.

describe("runEvaluators (in-memory mode)", () => {
  it("runs both PR1 evaluators against the launchwings-index fixture and reports pass/pass", async () => {
    // og-image evaluator probes the og:image URL — stub fetch to return 200
    // image/png. Meta-description does not hit the network because we pass
    // fetchedHtml on the target.
    const fetchMock = vi.fn(async () =>
      new Response(null, {
        status: 200,
        headers: { "content-type": "image/png", "content-length": "120000" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await runEvaluators(
        { url: "https://launchwings.com/", fetchedHtml: FIXTURE_HTML },
        [metaDescriptionEvaluator, ogImageEvaluator],
        { persistResults: false, now: () => 0 },
      );

      expect(result.results).toHaveLength(2);
      expect(result.summary.total).toBe(2);
      expect(result.summary.pass).toBe(2);
      expect(result.summary.warn).toBe(0);
      expect(result.summary.fail).toBe(0);

      const meta = result.results.find((r) => r.evaluatorId === "dogfood-LRS-08");
      const og = result.results.find((r) => r.evaluatorId === "dogfood-LRS-07");
      expect(meta).toBeDefined();
      expect(og).toBeDefined();
      expect(meta?.severity).toBe("pass");
      expect(og?.severity).toBe("pass");
      const metaEv = meta?.evidenceJson as Record<string, unknown>;
      expect(metaEv.length).toBe(146);
      const ogEv = og?.evidenceJson as Record<string, unknown>;
      expect(ogEv.ogImageUrl).toBe("https://launchwings.com/opengraph-image");
      expect(ogEv.contentType).toBe("image/png");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("runs evaluators in parallel up to the concurrency cap", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const slow: Evaluator = {
      id: "test-slow",
      title: "slow probe",
      checklistRef: "test-only",
      evaluate: async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 20));
        inFlight -= 1;
        return {
          evaluatorId: "test-slow",
          severity: "pass",
          score: 100,
          latencyMs: 20,
          costUsdMicros: 0,
          evidenceJson: {},
          fixActionMarkdown: "—",
        };
      },
    };
    // Same evaluator id 12 times — registry isn't involved here since we hand
    // the runner the array directly. The test only cares about scheduling.
    const evaluators: Evaluator[] = Array.from({ length: 12 }, () => slow);

    const result = await runEvaluators(
      { url: "https://example.com/" },
      evaluators,
      { persistResults: false, concurrency: 4 },
    );

    expect(result.results).toHaveLength(12);
    expect(maxInFlight).toBeLessThanOrEqual(4);
    // Sanity: with 4-way concurrency, we should have observed >1 in flight.
    expect(maxInFlight).toBeGreaterThan(1);
  });

  it("retries RetryableError up to twice with exponential backoff", async () => {
    let attempts = 0;
    const flaky: Evaluator = {
      id: "test-flaky",
      title: "flaky probe",
      checklistRef: "test-only",
      evaluate: async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new RetryableError(`attempt ${attempts}`);
        }
        return {
          evaluatorId: "test-flaky",
          severity: "pass",
          score: 100,
          latencyMs: 1,
          costUsdMicros: 0,
          evidenceJson: { attempts },
          fixActionMarkdown: "—",
        };
      },
    };

    const result = await runEvaluators(
      { url: "https://example.com/" },
      [flaky],
      { persistResults: false },
    );

    expect(attempts).toBe(3);
    expect(result.results[0]?.severity).toBe("pass");
  });

  it("synthesises a fail row when an evaluator throws non-retryable", async () => {
    const buggy: Evaluator = {
      id: "test-buggy",
      title: "buggy probe",
      checklistRef: "test-only",
      evaluate: async () => {
        throw new Error("kaboom");
      },
    };
    const result = await runEvaluators(
      { url: "https://example.com/" },
      [buggy],
      { persistResults: false },
    );
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.severity).toBe("fail");
    const ev = result.results[0]?.evidenceJson as Record<string, unknown>;
    expect(ev.error).toBe("kaboom");
    expect(ev.attempts).toBe(1);
    expect(result.summary.errored).toBe(1);
  });

  it("requires tenantId when persistResults !== false", async () => {
    await expect(
      runEvaluators(
        { url: "https://example.com/" },
        [metaDescriptionEvaluator],
        { persistResults: true },
      ),
    ).rejects.toThrow(/tenantId is required/);
  });

  it("forwards an injected LlmFn into AuditContext.llm (DI from auditTarget task)", async () => {
    // Verifies the cycle-fix wiring — packages/lrs accepts an abstract LlmFn
    // via runEvaluators options and threads it into ctx for evaluators that
    // need it. Concrete LLM lives in packages/agents; injected at the seam.
    let observedLlm: LlmFn | undefined;
    const probe: Evaluator = {
      id: "test-llm-probe",
      title: "asserts ctx.llm is set",
      checklistRef: "test-only",
      evaluate: async (_target, ctx) => {
        observedLlm = ctx.llm;
        return {
          evaluatorId: "test-llm-probe",
          severity: "pass",
          score: 100,
          latencyMs: 1,
          costUsdMicros: 0,
          evidenceJson: { llmInjected: !!ctx.llm },
          fixActionMarkdown: "—",
        };
      },
    };
    const fakeLlm: LlmFn = async () => ({
      text: "ok",
      costUsdMicros: 0,
      modelUsed: "anthropic:claude-haiku-4-5",
    });
    await runEvaluators(
      { url: "https://example.com/" },
      [probe],
      { persistResults: false, llm: fakeLlm },
    );
    expect(observedLlm).toBe(fakeLlm);
  });

  it("leaves AuditContext.llm undefined when not injected (graceful-degrade contract)", async () => {
    let observedLlm: LlmFn | undefined = (() => undefined) as unknown as LlmFn;
    const probe: Evaluator = {
      id: "test-no-llm-probe",
      title: "asserts ctx.llm is undefined",
      checklistRef: "test-only",
      evaluate: async (_target, ctx) => {
        observedLlm = ctx.llm;
        return {
          evaluatorId: "test-no-llm-probe",
          severity: "pass",
          score: 100,
          latencyMs: 1,
          costUsdMicros: 0,
          evidenceJson: {},
          fixActionMarkdown: "—",
        };
      },
    };
    await runEvaluators(
      { url: "https://example.com/" },
      [probe],
      { persistResults: false },
    );
    expect(observedLlm).toBeUndefined();
  });

  it("enforces the 60s budget — slow evaluators get harness_timeout fail rows (LRC-01)", async () => {
    const fast: Evaluator = {
      id: "fast",
      title: "fast probe",
      checklistRef: "test-only",
      async evaluate() {
        return {
          evaluatorId: "fast",
          severity: "pass",
          score: 100,
          latencyMs: 1,
          costUsdMicros: 0,
          evidenceJson: {},
          fixActionMarkdown: "—",
        };
      },
    };
    const slow: Evaluator = {
      id: "slow",
      title: "slow probe",
      checklistRef: "test-only",
      async evaluate() {
        await new Promise((r) => setTimeout(r, 1_000));
        return {
          evaluatorId: "slow",
          severity: "pass",
          score: 100,
          latencyMs: 1_000,
          costUsdMicros: 0,
          evidenceJson: {},
          fixActionMarkdown: "—",
        };
      },
    };
    const out = await runEvaluators(
      { url: "https://example.com/" },
      [fast, slow],
      { persistResults: false, budgetMs: 100 },
    );
    expect(out.results).toHaveLength(2);
    const slowRow = out.results.find((r) => r.evaluatorId === "slow");
    expect(slowRow?.severity).toBe("fail");
    expect(
      typeof slowRow?.evidenceJson === "object" &&
        slowRow?.evidenceJson !== null &&
        (slowRow.evidenceJson as Record<string, unknown>).error,
    ).toBe("harness_timeout");
    const fastRow = out.results.find((r) => r.evaluatorId === "fast");
    expect(fastRow?.severity).toBe("pass");
  });

  it("budgetMs=0 disables the deadline (LRC-01)", async () => {
    const slow: Evaluator = {
      id: "slow",
      title: "slow probe",
      checklistRef: "test-only",
      async evaluate() {
        await new Promise((r) => setTimeout(r, 60));
        return {
          evaluatorId: "slow",
          severity: "pass",
          score: 100,
          latencyMs: 60,
          costUsdMicros: 0,
          evidenceJson: {},
          fixActionMarkdown: "—",
        };
      },
    };
    const out = await runEvaluators(
      { url: "https://example.com/" },
      [slow],
      { persistResults: false, budgetMs: 0 },
    );
    expect(out.results[0]?.severity).toBe("pass");
  });
});
