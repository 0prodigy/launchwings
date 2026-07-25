import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  computeCostUsdMicros,
  hashMessages,
  llm,
  LLMConfigError,
  pickAvailableModel,
  pickStrongModel,
  withCassette,
  type LLMRequest,
} from "../index";

// Capture-mock for the OpenAI SDK. The factory closes over `lastOpenAIParams`
// so the test below can assert what params were forwarded to
// chat.completions.create — without burning real API credits and without
// needing a cassette layer for this branch.
//
// Tests that don't touch the openai branch (e.g. the cassette replay round
// trip uses anthropic:claude-haiku-4-5) are unaffected.
const lastOpenAIParams: { value: Record<string, unknown> | null } = { value: null };
vi.mock("openai", () => {
  return {
    default: class FakeOpenAI {
      public chat: {
        completions: {
          create: (params: Record<string, unknown>) => Promise<unknown>;
        };
      };
      constructor(_opts: unknown) {
        this.chat = {
          completions: {
            create: async (params: Record<string, unknown>) => {
              lastOpenAIParams.value = params;
              return {
                choices: [{ message: { content: "ok" } }],
                usage: {
                  prompt_tokens: 1,
                  completion_tokens: 1,
                  prompt_tokens_details: { cached_tokens: 0 },
                },
              };
            },
          },
        };
      }
    },
  };
});

// Tests run with LLM_CASSETTE_MODE=replay (set in vitest.config.ts). They
// exercise:
//   1. computeCostUsdMicros — pure pricing math, no I/O.
//   2. provider parsing / config errors — bad model strings + missing keys.
//   3. cassette replay round-trip — using the shipped fixture, end-to-end.
//
// Anything that requires a real API call belongs behind LLM_CASSETTE_MODE=record
// and is not part of CI.

describe("computeCostUsdMicros", () => {
  it("computes Haiku cost correctly for non-cached path", () => {
    // Haiku: $1/M input, $5/M output. 1000 in + 200 out =
    //   (1000/1M)*1 + (200/1M)*5 = 0.001 + 0.001 = 0.002 USD = 2_000 micros
    const cost = computeCostUsdMicros({
      model: "anthropic:claude-haiku-4-5",
      inputTokens: 1000,
      outputTokens: 200,
    });
    expect(cost).toBe(2000);
  });

  it("includes Anthropic cache read at 0.10x base input price", () => {
    // Sonnet input is $3/M. cache_read at 0.10x = $0.30/M.
    // 10_000 cache_read = 0.003 USD = 3_000 micros. Output 0 to isolate.
    const cost = computeCostUsdMicros({
      model: "anthropic:claude-sonnet-4-6",
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 10_000,
    });
    expect(cost).toBe(3000);
  });

  it("includes Anthropic cache write at 1.25x base input price", () => {
    // Sonnet input is $3/M. cache_write at 1.25x = $3.75/M.
    // 10_000 cache_write = 0.0375 USD = 37_500 micros.
    const cost = computeCostUsdMicros({
      model: "anthropic:claude-sonnet-4-6",
      inputTokens: 0,
      outputTokens: 0,
      cacheWriteTokens: 10_000,
    });
    expect(cost).toBe(37500);
  });

  it("computes OpenAI gpt-5 cost correctly", () => {
    // gpt-5: $5/M input, $15/M output. 1000 in + 200 out =
    //   0.005 + 0.003 = 0.008 USD = 8_000 micros.
    const cost = computeCostUsdMicros({
      model: "openai:gpt-5",
      inputTokens: 1000,
      outputTokens: 200,
    });
    expect(cost).toBe(8000);
  });

  it("returns 0 for zero tokens", () => {
    const cost = computeCostUsdMicros({
      model: "anthropic:claude-haiku-4-5",
      inputTokens: 0,
      outputTokens: 0,
    });
    expect(cost).toBe(0);
  });
});

describe("llm() error mapping", () => {
  it("throws LLMConfigError when ANTHROPIC_API_KEY is missing", async () => {
    // Cassette mode is "replay" by default, but we explicitly run OUTSIDE a
    // withCassette scope to hit the real provider path. With no key set, the
    // anthropic branch must throw a typed config error before any network IO.
    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      await expect(
        llm({
          model: "anthropic:claude-haiku-4-5",
          messages: [{ role: "user", content: "hi" }],
        }),
      ).rejects.toBeInstanceOf(LLMConfigError);
    } finally {
      if (original !== undefined) process.env.ANTHROPIC_API_KEY = original;
    }
  });

  it("throws LLMConfigError when OPENAI_API_KEY is missing", async () => {
    const original = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      await expect(
        llm({
          model: "openai:gpt-5",
          messages: [{ role: "user", content: "hi" }],
        }),
      ).rejects.toBeInstanceOf(LLMConfigError);
    } finally {
      if (original !== undefined) process.env.OPENAI_API_KEY = original;
    }
  });

  it("throws LLMConfigError on a malformed model id", async () => {
    await expect(
      llm({
        // Forced bad cast — runtime parse must catch it.
        model: "no-colon-here" as unknown as LLMRequest["model"],
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toBeInstanceOf(LLMConfigError);
  });

  it("rejects mid-stream system messages", async () => {
    await expect(
      llm({
        model: "anthropic:claude-haiku-4-5",
        messages: [
          { role: "user", content: "hi" },
          { role: "system", content: "oops" },
        ],
      }),
    ).rejects.toBeInstanceOf(LLMConfigError);
  });
});

describe("pickAvailableModel", () => {
  // Save + restore env across each test — these toggles affect the global
  // process.env which other tests in this file rely on.
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

  it("throws LLMConfigError when neither key is set", () => {
    expect(() => pickAvailableModel()).toThrow(LLMConfigError);
  });

  it("returns openai:gpt-5 when only OPENAI_API_KEY is set", () => {
    process.env.OPENAI_API_KEY = "sk-fake";
    expect(pickAvailableModel()).toBe("openai:gpt-5");
  });

  it("returns anthropic:claude-haiku-4-5 when only ANTHROPIC_API_KEY is set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-fake";
    expect(pickAvailableModel()).toBe("anthropic:claude-haiku-4-5");
  });

  it("prefers OpenAI when BOTH keys are set (founder authorization 2026-05-08)", () => {
    process.env.OPENAI_API_KEY = "sk-fake";
    process.env.ANTHROPIC_API_KEY = "sk-ant-fake";
    expect(pickAvailableModel()).toBe("openai:gpt-5");
  });

  it("honours preferredProvider='anthropic' when that key is available", () => {
    process.env.OPENAI_API_KEY = "sk-fake";
    process.env.ANTHROPIC_API_KEY = "sk-ant-fake";
    expect(pickAvailableModel("anthropic")).toBe("anthropic:claude-haiku-4-5");
  });

  it("falls through to OpenAI when caller asks for anthropic but no Anthropic key", () => {
    process.env.OPENAI_API_KEY = "sk-fake";
    expect(pickAvailableModel("anthropic")).toBe("openai:gpt-5");
  });

  it("respects LLM_OPENAI_DEFAULT_MODEL=openai:gpt-4o-mini override", () => {
    process.env.OPENAI_API_KEY = "sk-fake";
    process.env.LLM_OPENAI_DEFAULT_MODEL = "openai:gpt-4o-mini";
    expect(pickAvailableModel()).toBe("openai:gpt-4o-mini");
  });

  it("ignores an invalid LLM_OPENAI_DEFAULT_MODEL override", () => {
    process.env.OPENAI_API_KEY = "sk-fake";
    process.env.LLM_OPENAI_DEFAULT_MODEL = "openai:not-a-model";
    expect(pickAvailableModel()).toBe("openai:gpt-5");
  });
});

describe("pickStrongModel", () => {
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

  it("throws LLMConfigError when neither key is set", () => {
    expect(() => pickStrongModel()).toThrow(LLMConfigError);
  });

  it("prefers Sonnet when ANTHROPIC_API_KEY is set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-fake";
    expect(pickStrongModel()).toBe("anthropic:claude-sonnet-4-6");
  });

  it("prefers Sonnet even when both keys are set (Sonnet > gpt-5 for ICP discovery)", () => {
    process.env.ANTHROPIC_API_KEY = "sk-fake";
    process.env.OPENAI_API_KEY = "sk-fake";
    expect(pickStrongModel()).toBe("anthropic:claude-sonnet-4-6");
  });

  it("falls back to openai:gpt-5 when only OPENAI_API_KEY is set", () => {
    process.env.OPENAI_API_KEY = "sk-fake";
    expect(pickStrongModel()).toBe("openai:gpt-5");
  });

  it("respects LLM_OPENAI_DEFAULT_MODEL=openai:gpt-4o-mini override on the OpenAI fallback", () => {
    process.env.OPENAI_API_KEY = "sk-fake";
    process.env.LLM_OPENAI_DEFAULT_MODEL = "openai:gpt-4o-mini";
    expect(pickStrongModel()).toBe("openai:gpt-4o-mini");
  });
});

describe("hashMessages", () => {
  it("is stable for the same input", () => {
    const req: LLMRequest = {
      model: "anthropic:claude-haiku-4-5",
      system: "x",
      messages: [{ role: "user", content: "y" }],
    };
    expect(hashMessages(req)).toBe(hashMessages(req));
  });

  it("differs when the prompt changes", () => {
    const a: LLMRequest = {
      model: "anthropic:claude-haiku-4-5",
      messages: [{ role: "user", content: "a" }],
    };
    const b: LLMRequest = {
      model: "anthropic:claude-haiku-4-5",
      messages: [{ role: "user", content: "b" }],
    };
    expect(hashMessages(a)).not.toBe(hashMessages(b));
  });

  it("ignores temperature/maxOutputTokens (cassette match should be on prompt only)", () => {
    const a: LLMRequest = {
      model: "anthropic:claude-haiku-4-5",
      messages: [{ role: "user", content: "a" }],
      temperature: 0.1,
      maxOutputTokens: 100,
    };
    const b: LLMRequest = {
      model: "anthropic:claude-haiku-4-5",
      messages: [{ role: "user", content: "a" }],
      temperature: 0.9,
      maxOutputTokens: 9999,
    };
    expect(hashMessages(a)).toBe(hashMessages(b));
  });
});

describe("callOpenAI: reasoning-model temperature handling", () => {
  // Regression for the bug where pickStrongModel() degraded to openai:gpt-5
  // and Discovery/Positioning agents (which hard-code temperature: 0.2/0.1/0.3
  // /0.4) tripped HTTP 400 "Only the default (1) value is supported".
  // OpenAI reasoning models (gpt-5, o1/o3/o4) only accept the default
  // temperature; the wrapper must strip the field for those models.
  let savedKey: string | undefined;
  beforeEach(() => {
    savedKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "sk-fake-test";
    lastOpenAIParams.value = null;
  });
  afterEach(() => {
    if (savedKey !== undefined) process.env.OPENAI_API_KEY = savedKey;
    else delete process.env.OPENAI_API_KEY;
  });

  it("drops temperature for openai:gpt-5 even when caller passes a non-1 value", async () => {
    await llm({
      model: "openai:gpt-5",
      messages: [{ role: "user", content: "hi" }],
      temperature: 0.2,
    });
    expect(lastOpenAIParams.value).not.toBeNull();
    expect(lastOpenAIParams.value).not.toHaveProperty("temperature");
  });

  it("forwards temperature for openai:gpt-4o-mini (non-reasoning model)", async () => {
    await llm({
      model: "openai:gpt-4o-mini",
      messages: [{ role: "user", content: "hi" }],
      temperature: 0.3,
    });
    expect(lastOpenAIParams.value).not.toBeNull();
    expect(lastOpenAIParams.value).toHaveProperty("temperature", 0.3);
  });
});

describe("cassette replay round-trip", () => {
  it("returns the recorded response without making a network call", async () => {
    // The fixture cassettes/llm-test-pingpong.jsonl ships with a known hash
    // matching the prompt below. If this test fails after a refactor, the
    // hash may have drifted — re-record under LLM_CASSETTE_MODE=record.
    const result = await withCassette("llm-test-pingpong", async () => {
      return llm({
        model: "anthropic:claude-haiku-4-5",
        system: "You are a test stub.",
        messages: [{ role: "user", content: "ping" }],
      });
    });
    expect(result.text).toBe("pong");
    expect(result.modelUsed).toBe("anthropic:claude-haiku-4-5");
    expect(result.costUsdMicros).toBe(17);
    expect(result.inputTokens).toBe(7);
    expect(result.outputTokens).toBe(1);
  });

  it("throws on a hash mismatch (prompt drift signal)", async () => {
    await expect(
      withCassette("llm-test-pingpong", async () => {
        return llm({
          model: "anthropic:claude-haiku-4-5",
          system: "You are a test stub.",
          messages: [{ role: "user", content: "ping-but-different" }],
        });
      }),
    ).rejects.toThrow(/hash mismatch/);
  });

  it("throws on missing cassette file", async () => {
    await expect(
      withCassette("does-not-exist-cassette", async () => {
        return llm({
          model: "anthropic:claude-haiku-4-5",
          messages: [{ role: "user", content: "anything" }],
        });
      }),
    ).rejects.toThrow(/not found/);
  });
});
