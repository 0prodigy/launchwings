import { describe, it, expect, vi } from "vitest";
import { runHelloAgent, withCassette, type AgentHelpers } from "../index";

// Tests the pure run body of helloAgent against the recorded cassette
// `hello-formal.jsonl`. We bypass defineAgent (which needs a live db) by
// driving runHelloAgent directly with a stub helpers object that delegates
// to the real cassette-aware llm wrapper.

function makeHelpers(): { helpers: AgentHelpers; logged: Record<string, unknown>[] } {
  const logged: Record<string, unknown>[] = [];
  // Lazy import to avoid a cycle and to ensure llm picks up the in-scope
  // interceptor set by withCassette.
  const helpers: AgentHelpers = {
    llm: async (req) => {
      const { llm } = await import("../llm");
      return llm(req);
    },
    logEvent: (line) => {
      logged.push(line);
    },
  };
  return { helpers, logged };
}

describe("helloAgent run body", () => {
  it("returns the static greeting when no tone is supplied (no llm call)", async () => {
    const { helpers, logged } = makeHelpers();
    const llmSpy = vi.spyOn(helpers, "llm");
    const result = await runHelloAgent(
      { tenantId: "00000000-0000-0000-0000-000000000000", name: "Ada" },
      helpers,
      { agentRunId: "ar1", triggerRunId: "tr1", tenantId: "00000000-0000-0000-0000-000000000000" },
    );
    expect(result.greeting).toBe("hello, Ada");
    expect(result.costUsdMicros).toBe(0);
    expect(llmSpy).not.toHaveBeenCalled();
    expect(logged.some((l) => l.message === "hello_agent_invoked")).toBe(true);
  });

  it("uses llm() under withCassette replay for tone='formal'", async () => {
    const { helpers } = makeHelpers();
    const result = await withCassette("hello-formal", async () => {
      return runHelloAgent(
        {
          tenantId: "00000000-0000-0000-0000-000000000000",
          name: "Ada",
          tone: "formal",
        },
        helpers,
        {
          agentRunId: "ar1",
          triggerRunId: "tr1",
          tenantId: "00000000-0000-0000-0000-000000000000",
        },
      );
    });
    expect(result.greeting).toBe("Good day, Ada — a pleasure to make your acquaintance.");
    expect(result.costUsdMicros).toBe(42);
  });
});
