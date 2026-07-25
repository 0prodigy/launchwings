// ONB-04 — Discovery Agent eval harness.
//
// 3 seed product inputs are encoded inline below. The 20-input golden set is
// deferred to a follow-up ticket (`onb-04-followup-eval-expansion.md`) — the
// 3 here exercise three structural shapes (URL-only, brief-only, both).
//
// This file MUST NOT call the network in default CI runs. Each `it` is gated
// by `it.skipIf(...)` so that vitest reports them as skipped unless BOTH
// `RUN_EVALS=1` AND `ANTHROPIC_API_KEY` are set in the env. The judge pass is
// a second Sonnet call against the same key.

import { describe, it, expect } from "vitest";
import {
  buildDiscoveryUserMessage,
  discoveryOutputSchema,
  llm,
  DISCOVERY_SYSTEM_PROMPT,
  type DiscoveryOutput,
  type DiscoveryProductInput,
} from "../index";

const RUN_EVALS =
  process.env.RUN_EVALS === "1" && Boolean(process.env.ANTHROPIC_API_KEY);

interface EvalCase {
  label: string;
  product: DiscoveryProductInput;
}

const CASES: EvalCase[] = [
  {
    label: "url-only-saas",
    product: {
      url: "https://linear.app",
      name: "Linear",
      briefText: null,
      metadata: {
        extracted: {
          title: "Linear — Plan and build products",
          metaDescription:
            "Linear streamlines software projects, sprints, tasks, and bug tracking.",
          heroHeadline: "Plan and build products",
          primaryCta: "Get started",
          ogImagePresent: true,
        },
      },
    },
  },
  {
    label: "brief-only-indie",
    product: {
      url: null,
      name: "Plotly the Founder Bot",
      briefText:
        "a slack bot that asks solo founders one question per morning to keep their build-in-public posting cadence consistent. ICP: indie hackers shipping a saas in public, currently posting to twitter/x. wedge: zero-friction prompt vs. a blank text editor.",
      metadata: null,
    },
  },
  {
    label: "url-and-brief-b2b",
    product: {
      url: "https://example-rev-ops.com",
      name: "RevPilot",
      briefText:
        "rev-ops co-pilot for B2B sales teams of 10-50 reps. Audits salesforce hygiene, surfaces stale opps, suggests next outreach. Sells to RevOps directors at series-B+ companies.",
      metadata: {
        extracted: {
          title: "RevPilot — RevOps co-pilot",
          metaDescription:
            "Audit your pipeline. Find the deals slipping. Tell your reps what to do next.",
          heroHeadline: "Stop losing deals to bad pipeline hygiene.",
          primaryCta: "Book a demo",
          ogImagePresent: true,
        },
      },
    },
  },
];

const JUDGE_SYSTEM_PROMPT = [
  "You are an evaluation judge for the LaunchWings Discovery Agent. You read",
  "(a) the original product input and (b) the agent's structured JSON output,",
  "and score it on two axes:",
  "- relevance: do the ICPs, competitors, and channel scores plausibly fit the",
  "  product as described? (1=off-topic, 5=tightly aligned).",
  "- completeness: are the fields specific (named ICPs, real competitors, real",
  "  rationales) rather than vague placeholders? (1=placeholder, 5=specific).",
  "Return ONLY valid JSON: {\"relevance\": 1-5, \"completeness\": 1-5, \"notes\": string}.",
].join("\n");

async function runJudge(
  product: DiscoveryProductInput,
  output: DiscoveryOutput,
): Promise<{ relevance: number; completeness: number; notes: string }> {
  const userMsg = [
    "Product input:",
    JSON.stringify(product, null, 2),
    "",
    "Agent output:",
    JSON.stringify(output, null, 2),
    "",
    "Score relevance and completeness 1-5 each. Return JSON only.",
  ].join("\n");
  const resp = await llm({
    model: "anthropic:claude-sonnet-4-6",
    system: JUDGE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMsg }],
    maxOutputTokens: 400,
    temperature: 0,
  });
  const text = resp.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  return JSON.parse(text) as {
    relevance: number;
    completeness: number;
    notes: string;
  };
}

describe("discovery eval — LLM judge", () => {
  for (const c of CASES) {
    it.skipIf(!RUN_EVALS)(
      `${c.label}: judge scores >= 4 on relevance + completeness`,
      async () => {
        const userMessage = buildDiscoveryUserMessage({ product: c.product });
        const resp = await llm({
          model: "anthropic:claude-sonnet-4-6",
          system: DISCOVERY_SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMessage }],
          maxOutputTokens: 2048,
          temperature: 0.2,
        });
        const text = resp.text
          .trim()
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/```\s*$/i, "");
        const parsed = discoveryOutputSchema.parse(JSON.parse(text));
        const judgement = await runJudge(c.product, parsed);
        expect(judgement.relevance).toBeGreaterThanOrEqual(4);
        expect(judgement.completeness).toBeGreaterThanOrEqual(4);
      },
      120_000,
    );
  }
});
