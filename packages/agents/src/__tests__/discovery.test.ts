import { describe, it, expect } from "vitest";
import {
  buildDiscoveryUserMessage,
  buildDegradedDiscoveryOutput,
  discoveryOutputSchema,
  runDiscoveryAgent,
  type AgentHelpers,
  type DiscoveryAgentOutput,
  type DiscoveryOutput,
  type DiscoveryPayload,
  type DiscoveryProductInput,
} from "../index";

// ONB-04 — Discovery Agent unit tests.
//
// These avoid the cassette layer: every test stubs `helpers.llm` directly so
// we control the model output deterministically. The DB boundary is a chain-
// level mock (mirrors insight.test's makeMockTx pattern but adapted to the
// select+update path the discovery agent takes).

const TENANT = "00000000-0000-0000-0000-000000000000";
const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";

const VALID_OUTPUT: DiscoveryOutput = {
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
  competitors: [
    {
      name: "Buffer",
      url: "https://buffer.com",
      why_they_lose: "social-only, no launch orchestration.",
    },
    { name: "Typefully", why_they_lose: "writing-only; no agents." },
  ],
  current_seo_posture: {
    title_present: true,
    meta_description_present: true,
    og_image_present: false,
    headline_clarity_score: 70,
    notes: "title is clear; og:image missing.",
  },
  channel_suitability_scores: {
    producthunt: { score: 80, rationale: "polished landing page with clear value prop." },
    betalist: { score: 75, rationale: "pre-launch waitlist phase fits betalist." },
    hackernews: { score: 60, rationale: "agent architecture has technical depth." },
    reddit: { score: 50, rationale: "broad indie hacker audience; r/SaaS fits." },
    twitter: { score: 85, rationale: "build-in-public works for solo founder voice." },
    linkedin: { score: 30, rationale: "consumer indie-dev audience, not B2B ops." },
  },
};

// ----- Prompt construction snapshot ---------------------------------------

describe("buildDiscoveryUserMessage", () => {
  it("flattens fixed input into the canonical body (line order is stable)", () => {
    const input: DiscoveryProductInput = {
      url: "https://launchwings.dev",
      name: "LaunchWings",
      briefText: "a launch copilot for solo founders.",
      metadata: {
        extracted: {
          title: "LaunchWings — launch copilot",
          metaDescription: "ship a launch in a week.",
          heroHeadline: "ship faster.",
          primaryCta: "join waitlist",
        },
        screenshot: { ogImagePresent: true },
      },
    };
    const expected = [
      `Product name: LaunchWings`,
      `URL: https://launchwings.dev`,
      ``,
      `Extracted homepage metadata:`,
      `- title: LaunchWings — launch copilot`,
      `- meta_description: ship a launch in a week.`,
      `- hero_headline: ship faster.`,
      `- primary_cta: join waitlist`,
      `- og_image_present: true`,
      ``,
      `Founder brief (truncated to 4000 chars):`,
      `a launch copilot for solo founders.`,
      ``,
      `Return ONLY the JSON object as specified by the system prompt.`,
    ].join("\n");
    expect(buildDiscoveryUserMessage({ product: input })).toBe(expected);
  });

  it("substitutes (missing) for absent extracted fields and (none) for null url", () => {
    const body = buildDiscoveryUserMessage({
      product: { url: null, name: "Stub", briefText: null, metadata: null },
    });
    expect(body).toContain("URL: (none)");
    expect(body).toContain("- title: (missing)");
    expect(body).toContain("- og_image_present: false");
    expect(body).toContain("(no brief provided)");
  });

  it("omits the founder-notes block when notes is undefined or whitespace-only", () => {
    const baseProduct: DiscoveryProductInput = {
      url: null,
      name: "Stub",
      briefText: null,
      metadata: null,
    };
    const noNotes = buildDiscoveryUserMessage({ product: baseProduct });
    const whitespaceNotes = buildDiscoveryUserMessage({
      product: baseProduct,
      notes: "   \n  ",
    });
    expect(noNotes).not.toContain("Founder follow-up notes");
    expect(whitespaceNotes).toBe(noNotes);
  });

  it("appends the founder-notes block at the very end when notes is non-empty", () => {
    const baseProduct: DiscoveryProductInput = {
      url: null,
      name: "Stub",
      briefText: null,
      metadata: null,
    };
    const noNotes = buildDiscoveryUserMessage({ product: baseProduct });
    const withNotes = buildDiscoveryUserMessage({
      product: baseProduct,
      notes: "make it punchier; emphasise the audit angle.",
    });
    expect(withNotes.startsWith(noNotes)).toBe(true);
    expect(withNotes).toContain("Founder follow-up notes (regenerate request):");
    expect(withNotes.trimEnd().endsWith("make it punchier; emphasise the audit angle.")).toBe(true);
  });
});

// ----- Output schema validation -------------------------------------------

describe("discoveryOutputSchema", () => {
  it("accepts a well-formed payload", () => {
    expect(() => discoveryOutputSchema.parse(VALID_OUTPUT)).not.toThrow();
  });

  it("rejects when three_icps has the wrong length", () => {
    const bad = {
      ...VALID_OUTPUT,
      three_icps: VALID_OUTPUT.three_icps.slice(0, 2),
    };
    expect(() => discoveryOutputSchema.parse(bad)).toThrow();
  });

  it("rejects when a channel score is out of range", () => {
    const bad = {
      ...VALID_OUTPUT,
      channel_suitability_scores: {
        ...VALID_OUTPUT.channel_suitability_scores,
        producthunt: { score: 150, rationale: "too high — should fail." },
      },
    };
    expect(() => discoveryOutputSchema.parse(bad)).toThrow();
  });

  it("rejects when current_seo_posture is missing", () => {
    const { current_seo_posture: _drop, ...rest } = VALID_OUTPUT;
    void _drop;
    expect(() => discoveryOutputSchema.parse(rest)).toThrow();
  });
});

// ----- Degraded fallback ---------------------------------------------------

describe("buildDegradedDiscoveryOutput", () => {
  it("returns a payload that itself passes discoveryOutputSchema", () => {
    const out = buildDegradedDiscoveryOutput({
      url: null,
      name: "Test Product",
      briefText: null,
      metadata: null,
    });
    expect(() => discoveryOutputSchema.parse(out)).not.toThrow();
  });
});

// ----- Persistence path (stub helpers.llm) --------------------------------

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

function makeStubHelpers(text: string): {
  helpers: AgentHelpers;
  calls: Array<{ system?: string; user: string }>;
} {
  const calls: Array<{ system?: string; user: string }> = [];
  const helpers: AgentHelpers = {
    llm: async (req) => {
      calls.push({
        system: req.system,
        user: req.messages.find((m) => m.role === "user")?.content ?? "",
      });
      return {
        text,
        costUsdMicros: 12_000, // $0.012; well under cap
        modelUsed: req.model,
        latencyMs: 10,
        inputTokens: 100,
        outputTokens: 50,
      };
    },
    logEvent: () => {},
  };
  return { helpers, calls };
}

const PAYLOAD: DiscoveryPayload = {
  tenantId: TENANT,
  productId: PRODUCT_ID,
};

describe("runDiscoveryAgent — persistence", () => {
  it("merges the discovery output into products.metadata.discovery", async () => {
    const productRow = {
      id: PRODUCT_ID,
      tenantId: TENANT,
      name: "LaunchWings",
      url: "https://launchwings.dev",
      briefText: "stub",
      metadata: { existingKey: "keep me" },
    };
    const { tx, updates } = makeMockTx(productRow);
    const { helpers, calls } = makeStubHelpers(JSON.stringify(VALID_OUTPUT));

    const result: DiscoveryAgentOutput = await runDiscoveryAgent(
      PAYLOAD,
      helpers,
      {
        agentRunId: "agent-run-id",
        triggerRunId: "trigger-run-id",
        tenantId: TENANT,
        tx: tx as never,
        model: "anthropic:claude-sonnet-4-6",
      },
    );

    expect(result.degraded).toBe(false);
    expect(result.productId).toBe(PRODUCT_ID);
    expect(result.modelId).toBe("anthropic:claude-sonnet-4-6");
    expect(result.output.value_prop).toBe(VALID_OUTPUT.value_prop);

    expect(updates).toHaveLength(1);
    const meta = updates[0]!.setVals.metadata as Record<string, unknown>;
    expect(meta.existingKey).toBe("keep me");
    const discovery = meta.discovery as Record<string, unknown>;
    expect(discovery.degraded).toBe(false);
    expect(discovery.modelId).toBe("anthropic:claude-sonnet-4-6");
    expect((discovery.output as DiscoveryOutput).value_prop).toBe(VALID_OUTPUT.value_prop);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.system).toContain("LaunchWings Discovery Agent");
  });

  it("falls back to a degraded brief and persists it when both LLM attempts fail", async () => {
    const productRow = {
      id: PRODUCT_ID,
      tenantId: TENANT,
      name: "Broken",
      url: null,
      briefText: null,
      metadata: null,
    };
    const { tx, updates } = makeMockTx(productRow);
    const { helpers } = makeStubHelpers("not json at all");

    const result = await runDiscoveryAgent(PAYLOAD, helpers, {
      agentRunId: "agent-run-id",
      triggerRunId: "trigger-run-id",
      tenantId: TENANT,
      tx: tx as never,
      model: "anthropic:claude-sonnet-4-6",
    });

    expect(result.degraded).toBe(true);
    expect(updates).toHaveLength(1);
    const meta = updates[0]!.setVals.metadata as Record<string, unknown>;
    const discovery = meta.discovery as Record<string, unknown>;
    expect(discovery.degraded).toBe(true);
    // Even the degraded fallback must validate.
    expect(() =>
      discoveryOutputSchema.parse(discovery.output),
    ).not.toThrow();
  });

  it("degrades when LLM returns empty content (gpt-5 budget exhaustion)", async () => {
    // Reproduces the prod failure where openai:gpt-5 burned its
    // max_completion_tokens entirely on hidden reasoning, leaving content="".
    // The bare-catch parse used to swallow this; the new code path emits a
    // discovery_parse_fail event with finishReason / reasoningTokens.
    const productRow = {
      id: PRODUCT_ID,
      tenantId: TENANT,
      name: "LaunchWings",
      url: "https://launchwings.com",
      briefText: null,
      metadata: null,
    };
    const { tx, updates } = makeMockTx(productRow);

    const events: Array<Record<string, unknown>> = [];
    const helpers: AgentHelpers = {
      llm: async (req) => ({
        text: "",
        costUsdMicros: 35_290,
        modelUsed: req.model,
        latencyMs: 12,
        inputTokens: 800,
        outputTokens: 0,
        finishReason: "length",
        reasoningTokens: 2000,
      }),
      logEvent: (line) => events.push(line),
    };

    const result = await runDiscoveryAgent(PAYLOAD, helpers, {
      agentRunId: "agent-run-id",
      triggerRunId: "trigger-run-id",
      tenantId: TENANT,
      tx: tx as never,
      model: "openai:gpt-5",
    });

    // Run completes — does not throw.
    expect(result.degraded).toBe(true);
    // Output matches the degraded fallback shape.
    const expected = buildDegradedDiscoveryOutput({
      url: "https://launchwings.com",
      name: "LaunchWings",
      briefText: null,
      metadata: null,
    });
    expect(result.output.value_prop).toBe(expected.value_prop);
    expect(result.output.three_icps).toHaveLength(3);
    expect(() => discoveryOutputSchema.parse(result.output)).not.toThrow();

    // Persistence still happens with degraded=true.
    expect(updates).toHaveLength(1);
    const meta = updates[0]!.setVals.metadata as Record<string, unknown>;
    expect((meta.discovery as { degraded: boolean }).degraded).toBe(true);

    // Observability: the new discovery_parse_fail event was logged for at
    // least one attempt, with finishReason / reasoningTokens populated.
    const parseFails = events.filter(
      (e) => e.kind === "discovery_parse_fail",
    );
    expect(parseFails.length).toBeGreaterThanOrEqual(1);
    expect(parseFails[0]?.finishReason).toBe("length");
    expect(parseFails[0]?.reasoningTokens).toBe(2000);
    expect(parseFails[0]?.textLength).toBe(0);
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
    const { helpers } = makeStubHelpers(JSON.stringify(VALID_OUTPUT));
    await expect(
      runDiscoveryAgent(PAYLOAD, helpers, {
        agentRunId: "agent-run-id",
        triggerRunId: "trigger-run-id",
        tenantId: TENANT,
        tx: tx as never,
        model: "anthropic:claude-sonnet-4-6",
      }),
    ).rejects.toThrow(/not found/);
  });
});
