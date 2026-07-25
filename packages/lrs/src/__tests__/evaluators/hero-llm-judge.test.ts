import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  heroLlmJudgeEvaluator,
  parseHeroFromHtml,
  parseHeroScoresFromLlm,
  pickJudgeModel,
} from "../../evaluators/hero-llm-judge";
import type { AuditContext, AuditTarget, LlmFn } from "../../types";
import { cassetteLlm } from "../test-utils/cassette";

// Tests for the LRS-02 hero-llm-judge evaluator.
//
// Two cassette-driven cases (strong / weak hero) and two deterministic ones
// (missing-h1 + llm-unavailable). Cassettes live in
// packages/lrs/cassettes/hero-judge-{strong,weak}.jsonl and are validated by
// messagesHash on every replay; if you change the prompt or the user
// content shape, the test fails loudly.

const STRONG_H1 = "Ship a launch in a weekend, even if you've never deployed before.";
const STRONG_LEDE =
  "LaunchWings turns 8-10 weeks of solo-founder launch work into one focused weekend, " +
  "by orchestrating the deploy, audit, and follow-up cycles you'd normally do by hand.";

const WEAK_H1 = "The future of work, today.";
const WEAK_LEDE =
  "Empower your team with next-generation, AI-driven solutions that unlock unprecedented productivity at scale.";

function htmlWithHero(h1: string, lede: string): string {
  return `<!doctype html><html><head><title>x</title></head><body><main><h1>${h1}</h1><p>${lede}</p></main></body></html>`;
}

function makeCtx(opts: { llm?: LlmFn } = {}): AuditContext {
  let t = 0;
  return {
    fetchHtml: async () => {
      throw new Error("fetchHtml should not be called when fetchedHtml is set");
    },
    runId: "test-run",
    now: () => t++,
    ...(opts.llm ? { llm: opts.llm } : {}),
  };
}

describe("parseHeroFromHtml", () => {
  it("extracts the first h1 + the first paragraph below it", () => {
    const { h1, lede } = parseHeroFromHtml(htmlWithHero(STRONG_H1, STRONG_LEDE));
    expect(h1).toBe(STRONG_H1);
    expect(lede).toBe(STRONG_LEDE);
  });

  it("returns null h1 when missing", () => {
    const { h1, lede } = parseHeroFromHtml("<html><body><p>no head</p></body></html>");
    expect(h1).toBeNull();
    expect(lede).toBeNull();
  });

  it("collapses whitespace inside the h1", () => {
    const { h1 } = parseHeroFromHtml("<h1>  multi\n  line  </h1><p>x</p>");
    expect(h1).toBe("multi line");
  });
});

describe("parseHeroScoresFromLlm", () => {
  it("parses a clean JSON response", () => {
    const scores = parseHeroScoresFromLlm(
      JSON.stringify({
        promiseClarity: 9,
        icpSpecificity: 8,
        concreteLanguage: 8,
        outcomeNamed: 10,
        ctaProximity: 10,
        recommendation: "ok",
      }),
    );
    expect(scores.promiseClarity).toBe(9);
    expect(scores.outcomeNamed).toBe(10);
  });

  it("strips ```json fences if the model adds them", () => {
    const scores = parseHeroScoresFromLlm(
      "```json\n" +
        JSON.stringify({
          promiseClarity: 5,
          icpSpecificity: 5,
          concreteLanguage: 5,
          outcomeNamed: 0,
          ctaProximity: 0,
          recommendation: "warn",
        }) +
        "\n```",
    );
    expect(scores.promiseClarity).toBe(5);
  });

  it("normalises binaries to 0 or 10", () => {
    const scores = parseHeroScoresFromLlm(
      JSON.stringify({
        promiseClarity: 7,
        icpSpecificity: 7,
        concreteLanguage: 7,
        outcomeNamed: 7,
        ctaProximity: 3,
        recommendation: "ok",
      }),
    );
    expect(scores.outcomeNamed).toBe(10);
    expect(scores.ctaProximity).toBe(0);
  });

  it("throws on missing recommendation", () => {
    expect(() =>
      parseHeroScoresFromLlm(
        JSON.stringify({
          promiseClarity: 7,
          icpSpecificity: 7,
          concreteLanguage: 7,
          outcomeNamed: 10,
          ctaProximity: 10,
        }),
      ),
    ).toThrow();
  });
});

describe("pickJudgeModel", () => {
  // Mirror the agents-side pickAvailableModel test pattern. We swap env vars
  // around the call site and restore afterwards. These two helpers should
  // stay behaviourally identical — if you tweak one, tweak the other.
  let savedAnthropic: string | undefined;
  let savedOpenAI: string | undefined;
  let savedOverride: string | undefined;

  beforeEach(() => {
    savedAnthropic = process.env.ANTHROPIC_API_KEY;
    savedOpenAI = process.env.OPENAI_API_KEY;
    savedOverride = process.env.LLM_OPENAI_DEFAULT_MODEL;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.LLM_OPENAI_DEFAULT_MODEL;
  });
  afterEach(() => {
    if (savedAnthropic !== undefined) process.env.ANTHROPIC_API_KEY = savedAnthropic;
    if (savedOpenAI !== undefined) process.env.OPENAI_API_KEY = savedOpenAI;
    if (savedOverride !== undefined) process.env.LLM_OPENAI_DEFAULT_MODEL = savedOverride;
  });

  it("returns openai:gpt-5 when only OPENAI_API_KEY is set (founder default)", () => {
    process.env.OPENAI_API_KEY = "sk-fake";
    expect(pickJudgeModel()).toBe("openai:gpt-5");
  });

  it("returns anthropic:claude-haiku-4-5 when only ANTHROPIC_API_KEY is set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-fake";
    expect(pickJudgeModel()).toBe("anthropic:claude-haiku-4-5");
  });

  it("honours an explicit override regardless of env", () => {
    process.env.OPENAI_API_KEY = "sk-fake";
    expect(pickJudgeModel({ override: "anthropic:claude-sonnet-4-6" })).toBe(
      "anthropic:claude-sonnet-4-6",
    );
  });

  it("respects LLM_OPENAI_DEFAULT_MODEL=openai:gpt-4o-mini", () => {
    process.env.OPENAI_API_KEY = "sk-fake";
    process.env.LLM_OPENAI_DEFAULT_MODEL = "openai:gpt-4o-mini";
    expect(pickJudgeModel()).toBe("openai:gpt-4o-mini");
  });

  it("falls back to anthropic:claude-haiku-4-5 when no keys + no override", () => {
    expect(pickJudgeModel()).toBe("anthropic:claude-haiku-4-5");
  });
});

describe("heroLlmJudgeEvaluator OpenAI-default routing", () => {
  // Validates that when only OPENAI_API_KEY is set and no judgeModel override
  // is provided, the evaluator passes "openai:gpt-5" (or LLM_OPENAI_DEFAULT_MODEL
  // override) into ctx.llm — i.e. it actually calls OpenAI in production
  // instead of failing on a missing Anthropic key.
  let savedAnthropic: string | undefined;
  let savedOpenAI: string | undefined;
  let savedOverride: string | undefined;

  beforeEach(() => {
    savedAnthropic = process.env.ANTHROPIC_API_KEY;
    savedOpenAI = process.env.OPENAI_API_KEY;
    savedOverride = process.env.LLM_OPENAI_DEFAULT_MODEL;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.LLM_OPENAI_DEFAULT_MODEL;
    process.env.OPENAI_API_KEY = "sk-fake";
  });
  afterEach(() => {
    if (savedAnthropic !== undefined) process.env.ANTHROPIC_API_KEY = savedAnthropic;
    else delete process.env.ANTHROPIC_API_KEY;
    if (savedOpenAI !== undefined) process.env.OPENAI_API_KEY = savedOpenAI;
    else delete process.env.OPENAI_API_KEY;
    if (savedOverride !== undefined) process.env.LLM_OPENAI_DEFAULT_MODEL = savedOverride;
    else delete process.env.LLM_OPENAI_DEFAULT_MODEL;
  });

  it("invokes ctx.llm with openai:gpt-5 when only OPENAI_API_KEY is set", async () => {
    let observedModel: string | null = null;
    const fakeLlm: LlmFn = async (opts) => {
      observedModel = opts.model;
      return {
        text: JSON.stringify({
          promiseClarity: 9,
          icpSpecificity: 9,
          concreteLanguage: 8,
          outcomeNamed: 10,
          ctaProximity: 10,
          recommendation: "good",
        }),
        costUsdMicros: 800,
        modelUsed: "openai:gpt-5",
      };
    };
    const target: AuditTarget = {
      url: "https://launchwings.com/",
      fetchedHtml: htmlWithHero(STRONG_H1, STRONG_LEDE),
    };
    const ctx = makeCtx({ llm: fakeLlm });
    const result = await heroLlmJudgeEvaluator.evaluate(target, ctx);
    expect(observedModel).toBe("openai:gpt-5");
    expect(result.severity).toBe("pass");
    const ev = result.evidenceJson as Record<string, unknown>;
    expect(ev.modelUsed).toBe("openai:gpt-5");
  });

  it("honours ctx.judgeModel override over the env-derived default", async () => {
    let observedModel: string | null = null;
    const fakeLlm: LlmFn = async (opts) => {
      observedModel = opts.model;
      return {
        text: JSON.stringify({
          promiseClarity: 7,
          icpSpecificity: 7,
          concreteLanguage: 7,
          outcomeNamed: 10,
          ctaProximity: 10,
          recommendation: "ok",
        }),
        costUsdMicros: 500,
        modelUsed: "anthropic:claude-sonnet-4-6",
      };
    };
    const target: AuditTarget = {
      url: "https://launchwings.com/",
      fetchedHtml: htmlWithHero(STRONG_H1, STRONG_LEDE),
    };
    const baseCtx = makeCtx({ llm: fakeLlm });
    const ctx: AuditContext = { ...baseCtx, judgeModel: "anthropic:claude-sonnet-4-6" };
    await heroLlmJudgeEvaluator.evaluate(target, ctx);
    expect(observedModel).toBe("anthropic:claude-sonnet-4-6");
  });
});

describe("heroLlmJudgeEvaluator", () => {
  it("strong hero: cassette replay → severity pass, score ≥ 70", async () => {
    const target: AuditTarget = {
      url: "https://launchwings.com/",
      fetchedHtml: htmlWithHero(STRONG_H1, STRONG_LEDE),
    };
    const ctx = makeCtx({ llm: cassetteLlm("hero-judge-strong") });
    const result = await heroLlmJudgeEvaluator.evaluate(target, ctx);
    expect(result.severity).toBe("pass");
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.costUsdMicros).toBeGreaterThan(0);
    const ev = result.evidenceJson as Record<string, unknown>;
    expect(ev.h1).toBe(STRONG_H1);
    const scores = ev.scores as Record<string, unknown>;
    expect(typeof scores.promiseClarity).toBe("number");
    expect(ev.parseError).toBeNull();
  });

  it("weak hero: cassette replay → severity fail, score < 50", async () => {
    const target: AuditTarget = {
      url: "https://example.com/",
      fetchedHtml: htmlWithHero(WEAK_H1, WEAK_LEDE),
    };
    const ctx = makeCtx({ llm: cassetteLlm("hero-judge-weak") });
    const result = await heroLlmJudgeEvaluator.evaluate(target, ctx);
    expect(result.severity).toBe("fail");
    expect(result.score).toBeLessThan(50);
    expect(result.fixActionMarkdown).toMatch(/Rewrite the hero|recommendation/i);
  });

  it("missing h1: deterministic warn (no llm call)", async () => {
    const target: AuditTarget = {
      url: "https://example.com/",
      fetchedHtml: "<html><body><p>no h1 here</p></body></html>",
    };
    // Provide an llm that throws if called — the missing-h1 short-circuit
    // must not hit the LLM.
    const exploding: LlmFn = async () => {
      throw new Error("llm should not be called when h1 is missing");
    };
    const ctx = makeCtx({ llm: exploding });
    const result = await heroLlmJudgeEvaluator.evaluate(target, ctx);
    expect(result.severity).toBe("warn");
    const ev = result.evidenceJson as Record<string, unknown>;
    expect(ev.skipped).toBe("missing_h1");
    expect(ev.h1).toBeNull();
    expect(result.costUsdMicros).toBe(0);
  });

  it("llm not configured: skipped warn", async () => {
    const target: AuditTarget = {
      url: "https://example.com/",
      fetchedHtml: htmlWithHero(STRONG_H1, STRONG_LEDE),
    };
    const ctx = makeCtx({}); // no llm injected
    const result = await heroLlmJudgeEvaluator.evaluate(target, ctx);
    expect(result.severity).toBe("warn");
    const ev = result.evidenceJson as Record<string, unknown>;
    expect(ev.skipped).toBe("llm_not_configured");
    expect(ev.h1).toBe(STRONG_H1);
    expect(result.costUsdMicros).toBe(0);
    expect(result.fixActionMarkdown).toMatch(/llm.*not configured/i);
  });
});
