import { describe, it, expect } from "vitest";
import {
  buildPositioningUserMessage,
  buildDegradedPositioningOutput,
  positioningOutputSchema,
  PositioningInputError,
  runPositioningAgent,
  scoreTaglineUnder12,
  type AgentHelpers,
  type PositioningAgentOutput,
  type PositioningOutput,
  type PositioningPayload,
  type PositioningProductInput,
} from "../index";

// ONB-05 — Positioning Agent unit tests.
//
// Mirrors discovery.test.ts: no cassettes, every test stubs `helpers.llm`.
// The DB boundary is a chain-level mock (select+update path).

const TENANT = "00000000-0000-0000-0000-000000000000";
const PRODUCT_ID = "22222222-2222-2222-2222-222222222222";

// A minimally-valid discovery payload to embed in product metadata for tests
// that exercise the prompt builder + run body.
const DISCOVERY_FIXTURE = {
  product_summary:
    "launchwings is a launch copilot for solo founders shipping pre-revenue saas products on tight time budgets.",
  value_prop: "ship a coherent launch in a week, not a quarter.",
  three_icps: [
    {
      name: "solo saas founder",
      role: "indie dev pre-launch",
      pains: ["no marketing time", "no audience"],
      gains: ["one place to plan launches"],
    },
    {
      name: "side-project hacker",
      role: "engineer with a weekend build",
      pains: ["never finishes a launch"],
      gains: ["clear next action"],
    },
    {
      name: "bootstrapped operator",
      role: "post-launch consumer of growth tools",
      pains: ["fragmented stack"],
      gains: ["consolidated tooling"],
    },
  ],
  channel_suitability_scores: {
    producthunt: { score: 80, rationale: "fits" },
    twitter: { score: 85, rationale: "fits" },
  },
};

// Schema-valid positioning output that the LLM "produces". Self-scores are
// intentionally LOW so we can verify the server judge OVERWRITES them.
const VALID_OUTPUT: PositioningOutput = {
  icps: [
    {
      name: "solo saas founder",
      role: "indie dev pre-launch",
      pains: ["no marketing bandwidth", "no audience yet"],
      gains: ["one tool for the whole launch", "fewer half-finished assets"],
    },
    {
      name: "side-project hacker",
      role: "engineer with a weekend build",
      pains: ["never finishes a launch", "loses momentum after shipping"],
      gains: ["clear next action", "one place to track progress"],
    },
    {
      name: "bootstrapped operator",
      role: "post-launch growth tinkerer",
      pains: ["fragmented growth stack", "no daily focus"],
      gains: ["consolidated tooling", "single daily insight brief"],
    },
  ],
  taglines: [
    {
      text: "ship your launch in a week.",
      // Self-score is intentionally garbage; server should overwrite.
      judge_score: { audience: false, problem: false, mechanism: false, under12: false, total: 0 },
    },
    {
      text: "the launch copilot for solo founders.",
      judge_score: { audience: false, problem: false, mechanism: false, under12: false, total: 0 },
    },
    {
      text: "stop shipping half-finished launches.",
      judge_score: { audience: false, problem: false, mechanism: false, under12: false, total: 0 },
    },
    {
      text: "one tool for the whole launch.",
      judge_score: { audience: false, problem: false, mechanism: false, under12: false, total: 0 },
    },
    {
      text: "your launch copilot.",
      judge_score: { audience: false, problem: false, mechanism: false, under12: false, total: 0 },
    },
  ],
};

// ----- scoreTaglineUnder12 -------------------------------------------------

describe("scoreTaglineUnder12", () => {
  it("returns true for an 11-word tagline", () => {
    const eleven = "one two three four five six seven eight nine ten eleven";
    expect(eleven.split(" ").length).toBe(11);
    expect(scoreTaglineUnder12(eleven)).toBe(true);
  });

  it("returns false at exactly 12 words (under-12 is strict)", () => {
    const twelve = "one two three four five six seven eight nine ten eleven twelve";
    expect(twelve.split(" ").length).toBe(12);
    expect(scoreTaglineUnder12(twelve)).toBe(false);
  });

  it("returns false for >12 words", () => {
    const thirteen = "one two three four five six seven eight nine ten eleven twelve thirteen";
    expect(scoreTaglineUnder12(thirteen)).toBe(false);
  });

  it("collapses whitespace runs (no empty-token false positives)", () => {
    expect(scoreTaglineUnder12("  short    tagline  ")).toBe(true);
  });
});

// ----- positioningOutputSchema --------------------------------------------

describe("positioningOutputSchema", () => {
  it("accepts a well-formed payload", () => {
    expect(() => positioningOutputSchema.parse(VALID_OUTPUT)).not.toThrow();
  });

  it("rejects when icps length != 3", () => {
    const bad = { ...VALID_OUTPUT, icps: VALID_OUTPUT.icps.slice(0, 2) };
    expect(() => positioningOutputSchema.parse(bad)).toThrow();
  });

  it("rejects when taglines length != 5", () => {
    const bad = { ...VALID_OUTPUT, taglines: VALID_OUTPUT.taglines.slice(0, 4) };
    expect(() => positioningOutputSchema.parse(bad)).toThrow();
  });

  it("rejects when judge_score.total is out of range", () => {
    const bad = {
      ...VALID_OUTPUT,
      taglines: [
        {
          text: "ok tagline",
          judge_score: { audience: true, problem: true, mechanism: true, under12: true, total: 9 },
        },
        ...VALID_OUTPUT.taglines.slice(1),
      ],
    };
    expect(() => positioningOutputSchema.parse(bad)).toThrow();
  });

  it("rejects when a required top-level field is missing", () => {
    const { icps: _drop, ...rest } = VALID_OUTPUT;
    void _drop;
    expect(() => positioningOutputSchema.parse(rest)).toThrow();
  });
});

// ----- buildPositioningUserMessage ----------------------------------------

describe("buildPositioningUserMessage", () => {
  const PRODUCT_INPUT: PositioningProductInput = {
    url: "https://launchwings.dev",
    name: "LaunchWings",
    briefText: null,
    metadata: {
      discovery: { output: DISCOVERY_FIXTURE },
    },
  };

  it("flattens discovery input into the canonical body (line order is stable)", () => {
    const body = buildPositioningUserMessage({ product: PRODUCT_INPUT });
    const expected = [
      `Product name: LaunchWings`,
      `URL: https://launchwings.dev`,
      ``,
      `Discovery brief:`,
      `- product_summary: ${DISCOVERY_FIXTURE.product_summary}`,
      `- value_prop: ${DISCOVERY_FIXTURE.value_prop}`,
      ``,
      `Discovery ICPs:`,
      `- icp_1.name: solo saas founder`,
      `- icp_1.role: indie dev pre-launch`,
      `- icp_1.pains: no marketing time | no audience`,
      `- icp_1.gains: one place to plan launches`,
      `- icp_2.name: side-project hacker`,
      `- icp_2.role: engineer with a weekend build`,
      `- icp_2.pains: never finishes a launch`,
      `- icp_2.gains: clear next action`,
      `- icp_3.name: bootstrapped operator`,
      `- icp_3.role: post-launch consumer of growth tools`,
      `- icp_3.pains: fragmented stack`,
      `- icp_3.gains: consolidated tooling`,
      ``,
      `Channel suitability scores:`,
      `- producthunt: score=80`,
      `- twitter: score=85`,
      ``,
      `Return ONLY the JSON object as specified by the system prompt. 3 ICPs + 5 taglines, each tagline strictly under 12 words.`,
    ].join("\n");
    expect(body).toBe(expected);
  });

  it("omits the founder-notes block when notes is undefined or whitespace-only", () => {
    const noNotes = buildPositioningUserMessage({ product: PRODUCT_INPUT });
    const whitespaceNotes = buildPositioningUserMessage({
      product: PRODUCT_INPUT,
      notes: "   \n  ",
    });
    expect(noNotes).not.toContain("Founder follow-up notes");
    expect(whitespaceNotes).toBe(noNotes);
  });

  it("appends the founder-notes block at the very end when notes is non-empty", () => {
    const noNotes = buildPositioningUserMessage({ product: PRODUCT_INPUT });
    const withNotes = buildPositioningUserMessage({
      product: PRODUCT_INPUT,
      notes: "lean harder on the wedge against Buffer.",
    });
    expect(withNotes.startsWith(noNotes)).toBe(true);
    expect(withNotes).toContain("Founder follow-up notes (regenerate request):");
    expect(withNotes.trimEnd().endsWith("lean harder on the wedge against Buffer.")).toBe(true);
  });

  it("throws PositioningInputError when discovery is missing", () => {
    const product: PositioningProductInput = {
      url: null,
      name: "Stub",
      briefText: null,
      metadata: null,
    };
    expect(() => buildPositioningUserMessage({ product })).toThrow(
      PositioningInputError,
    );
  });
});

// ----- buildDegradedPositioningOutput -------------------------------------

describe("buildDegradedPositioningOutput", () => {
  it("returns a payload that itself passes positioningOutputSchema", () => {
    const out = buildDegradedPositioningOutput();
    expect(() => positioningOutputSchema.parse(out)).not.toThrow();
  });
});

// ----- runPositioningAgent (stubbed helpers.llm) --------------------------

interface UpdatedRow {
  setVals: Record<string, unknown>;
}

function makeMockTx(productRow: Record<string, unknown>): {
  tx: unknown;
  updates: UpdatedRow[];
} {
  const updates: UpdatedRow[] = [];
  const tx = {
    select: () => ({
      from: () => ({
        where: async () => [productRow],
      }),
    }),
    update: (_table: unknown) => ({
      set: (vals: Record<string, unknown>) => {
        const row: UpdatedRow = { setVals: vals };
        updates.push(row);
        return { where: async () => undefined };
      },
    }),
  };
  return { tx, updates };
}

/**
 * Stub helpers.llm that returns scripted responses in order. Each call
 * dequeues the next response. Lets us simulate (1) draft pass success +
 * (2) judge pass returning a chosen boolean triple per tagline.
 */
function makeScriptedHelpers(scripts: string[]): {
  helpers: AgentHelpers;
  calls: Array<{ system?: string; user: string }>;
} {
  const calls: Array<{ system?: string; user: string }> = [];
  let idx = 0;
  const helpers: AgentHelpers = {
    llm: async (req) => {
      const text = scripts[idx] ?? "{}";
      idx += 1;
      calls.push({
        system: req.system,
        user: req.messages.find((m) => m.role === "user")?.content ?? "",
      });
      return {
        text,
        costUsdMicros: 5_000,
        modelUsed: req.model,
        latencyMs: 5,
        inputTokens: 50,
        outputTokens: 25,
      };
    },
    logEvent: () => {},
  };
  return { helpers, calls };
}

const PAYLOAD: PositioningPayload = {
  tenantId: TENANT,
  productId: PRODUCT_ID,
};

describe("runPositioningAgent — persistence", () => {
  it("merges output into products.metadata.positioning and reconciles judge scores (server wins)", async () => {
    const productRow = {
      id: PRODUCT_ID,
      tenantId: TENANT,
      name: "LaunchWings",
      url: "https://launchwings.dev",
      briefText: null,
      metadata: {
        existingKey: "keep me",
        discovery: { output: DISCOVERY_FIXTURE },
      },
    };
    const { tx, updates } = makeMockTx(productRow);

    // Judge pass: claim audience+problem true, mechanism false on every tagline.
    // Combined with under12 (true for all 5 fixture taglines), expect total=3.
    const judgeBody = {
      results: VALID_OUTPUT.taglines.map(() => ({
        audience: true,
        problem: true,
        mechanism: false,
      })),
    };
    const { helpers, calls } = makeScriptedHelpers([
      JSON.stringify(VALID_OUTPUT), // draft pass
      JSON.stringify(judgeBody),    // judge pass
    ]);

    const result: PositioningAgentOutput = await runPositioningAgent(
      PAYLOAD,
      helpers,
      {
        agentRunId: "agent-run-id",
        triggerRunId: "trigger-run-id",
        tenantId: TENANT,
        tx: tx as never,
        draftModel: "anthropic:claude-sonnet-4-6",
        judgeModel: "anthropic:claude-haiku-4-5",
      },
    );

    expect(result.degraded).toBe(false);
    expect(result.productId).toBe(PRODUCT_ID);
    expect(result.modelId).toBe("anthropic:claude-sonnet-4-6");

    // Persistence side-effect.
    expect(updates).toHaveLength(1);
    const meta = updates[0]!.setVals.metadata as Record<string, unknown>;
    expect(meta.existingKey).toBe("keep me");
    expect(meta.discovery).toBeDefined(); // not overwritten
    const positioning = meta.positioning as Record<string, unknown>;
    expect(positioning.degraded).toBe(false);
    expect(positioning.modelId).toBe("anthropic:claude-sonnet-4-6");

    // Reconciled judge score: server wins. Each tagline should now reflect
    // the judge pass booleans (audience=T, problem=T, mechanism=F) and the
    // deterministic under12=T. Total = 3.
    const persistedOutput = positioning.output as PositioningOutput;
    for (const t of persistedOutput.taglines) {
      expect(t.judge_score.audience).toBe(true);
      expect(t.judge_score.problem).toBe(true);
      expect(t.judge_score.mechanism).toBe(false);
      expect(t.judge_score.under12).toBe(true);
      expect(t.judge_score.total).toBe(3);
    }

    // Two LLM calls (draft + judge).
    expect(calls).toHaveLength(2);
    expect(calls[0]?.system).toContain("LaunchWings Positioning Agent");
    expect(calls[1]?.system).toContain("strict tagline judge");
  });

  it("falls back to a degraded output and persists it when both draft attempts fail", async () => {
    const productRow = {
      id: PRODUCT_ID,
      tenantId: TENANT,
      name: "Broken",
      url: null,
      briefText: null,
      metadata: { discovery: { output: DISCOVERY_FIXTURE } },
    };
    const { tx, updates } = makeMockTx(productRow);
    // Both draft attempts return garbage; degraded path skips the judge call.
    const { helpers } = makeScriptedHelpers(["not json", "still not json"]);

    const result = await runPositioningAgent(PAYLOAD, helpers, {
      agentRunId: "agent-run-id",
      triggerRunId: "trigger-run-id",
      tenantId: TENANT,
      tx: tx as never,
      draftModel: "anthropic:claude-sonnet-4-6",
      judgeModel: "anthropic:claude-haiku-4-5",
    });

    expect(result.degraded).toBe(true);
    expect(updates).toHaveLength(1);
    const meta = updates[0]!.setVals.metadata as Record<string, unknown>;
    const positioning = meta.positioning as Record<string, unknown>;
    expect(positioning.degraded).toBe(true);
    expect(() =>
      positioningOutputSchema.parse(positioning.output),
    ).not.toThrow();
  });

  it("degrades when LLM returns empty content (gpt-5 budget exhaustion)", async () => {
    // Reproduces the prod failure: openai:gpt-5 burns max_completion_tokens
    // on hidden reasoning, content="". The new path emits
    // positioning_parse_fail with finishReason / reasoningTokens populated.
    const productRow = {
      id: PRODUCT_ID,
      tenantId: TENANT,
      name: "LaunchWings",
      url: "https://launchwings.com",
      briefText: null,
      metadata: { discovery: { output: DISCOVERY_FIXTURE } },
    };
    const { tx, updates } = makeMockTx(productRow);

    const events: Array<Record<string, unknown>> = [];
    const helpers: AgentHelpers = {
      llm: async (req) => ({
        text: "",
        costUsdMicros: 50_000,
        modelUsed: req.model,
        latencyMs: 12,
        inputTokens: 600,
        outputTokens: 0,
        finishReason: "length",
        reasoningTokens: 1500,
      }),
      logEvent: (line) => events.push(line),
    };

    const result = await runPositioningAgent(PAYLOAD, helpers, {
      agentRunId: "agent-run-id",
      triggerRunId: "trigger-run-id",
      tenantId: TENANT,
      tx: tx as never,
      draftModel: "openai:gpt-5",
      judgeModel: "openai:gpt-4o-mini",
    });

    // Run completes — does not throw.
    expect(result.degraded).toBe(true);
    // Output matches degraded fallback shape (placeholder ICPs / taglines).
    const expected = buildDegradedPositioningOutput();
    expect(result.output.icps).toHaveLength(3);
    expect(result.output.taglines).toHaveLength(5);
    expect(result.output.taglines[0]?.text).toBe(expected.taglines[0]?.text);
    expect(() => positioningOutputSchema.parse(result.output)).not.toThrow();

    // Persistence still happens with degraded=true.
    expect(updates).toHaveLength(1);
    const meta = updates[0]!.setVals.metadata as Record<string, unknown>;
    expect((meta.positioning as { degraded: boolean }).degraded).toBe(true);

    // Observability: positioning_parse_fail logged with finishReason +
    // reasoningTokens for the budget-exhaustion attempt(s).
    const parseFails = events.filter(
      (e) => e.kind === "positioning_parse_fail",
    );
    expect(parseFails.length).toBeGreaterThanOrEqual(1);
    expect(parseFails[0]?.finishReason).toBe("length");
    expect(parseFails[0]?.reasoningTokens).toBe(1500);
    expect(parseFails[0]?.textLength).toBe(0);
  });

  it("throws PositioningInputError when metadata.discovery is missing", async () => {
    const productRow = {
      id: PRODUCT_ID,
      tenantId: TENANT,
      name: "No discovery yet",
      url: null,
      briefText: null,
      metadata: {},
    };
    const { tx } = makeMockTx(productRow);
    const { helpers } = makeScriptedHelpers([JSON.stringify(VALID_OUTPUT)]);

    await expect(
      runPositioningAgent(PAYLOAD, helpers, {
        agentRunId: "agent-run-id",
        triggerRunId: "trigger-run-id",
        tenantId: TENANT,
        tx: tx as never,
        draftModel: "anthropic:claude-sonnet-4-6",
        judgeModel: "anthropic:claude-haiku-4-5",
      }),
    ).rejects.toBeInstanceOf(PositioningInputError);
  });

  it("throws when the product row is not visible in tenant scope", async () => {
    const tx = {
      select: () => ({
        from: () => ({
          where: async () => [],
        }),
      }),
      update: () => ({ set: () => ({ where: async () => undefined }) }),
    };
    const { helpers } = makeScriptedHelpers([JSON.stringify(VALID_OUTPUT)]);
    await expect(
      runPositioningAgent(PAYLOAD, helpers, {
        agentRunId: "agent-run-id",
        triggerRunId: "trigger-run-id",
        tenantId: TENANT,
        tx: tx as never,
        draftModel: "anthropic:claude-sonnet-4-6",
        judgeModel: "anthropic:claude-haiku-4-5",
      }),
    ).rejects.toThrow(/not found/);
  });
});
