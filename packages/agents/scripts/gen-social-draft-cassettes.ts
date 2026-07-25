// Cassette generator for the social-draft agent tests.
//
// We don't have a way to record cassettes against a live OpenAI API in CI,
// and even with a key the model is non-deterministic. So we hand-author
// fixture cassettes and use this script to compute the messagesHash for each
// (system + messages) pair the test exercises. Run:
//
//   pnpm --filter @launchwings/agents tsx scripts/gen-social-draft-cassettes.ts
//
// The script writes packages/agents/cassettes/social-draft-*.jsonl. Re-run
// whenever the system prompt or fixture inputs change; commit the result.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hashMessages } from "../src/cassettes/record";
import {
  buildSocialDraftSystemPrompt,
  type VoiceSample,
} from "../src/voice";
import type { LLMRequest } from "../src/llm";

const HERE = dirname(fileURLToPath(import.meta.url));
const CASSETTES_DIR = join(HERE, "..", "cassettes");
mkdirSync(CASSETTES_DIR, { recursive: true });

// Stable corpus used in every test scenario. Hand-picked to look like the
// dogfood corpus without depending on the actual files (those rev as the
// founder ships posts; we don't want test cassettes to drift with them).
const FIXTURE_CORPUS: VoiceSample[] = [
  {
    slug: "2026-05-07-fixture-x",
    channel: "x",
    body: "shipped today: a thing that does the thing.\n\ndogfood loop closed.",
  },
  {
    slug: "2026-05-06-fixture-linkedin",
    channel: "linkedin",
    body: "shipped a small thing today.\n\nhere is what we learned: tests are the gift you give to future you.",
  },
];

// Stable user-message builder — must match userMessageFor() inside the agent
// EXACTLY for the cassette hashes to line up. We re-derive it here rather than
// importing to avoid a circular import; if the agent's userMessageFor() drifts
// the test's cassette will hash-mismatch and the failure will point here.
function userMessageFor(input: {
  channel: "x" | "linkedin";
  brief: {
    name: string;
    oneLiner: string;
    url?: string;
    audience: string;
    valueProp: string;
    callToAction?: string;
  };
  count: number;
}): string {
  const { channel, brief, count } = input;
  return [
    `Generate ${count} draft post(s) for channel: ${channel}.`,
    ``,
    `Product name: ${brief.name}`,
    `One-liner: ${brief.oneLiner}`,
    brief.url ? `URL: ${brief.url}` : null,
    `Audience: ${brief.audience}`,
    `Value prop: ${brief.valueProp}`,
    brief.callToAction ? `Call to action: ${brief.callToAction}` : null,
    ``,
    `Return only valid JSON in the shape specified by the system prompt.`,
  ]
    .filter(Boolean)
    .join("\n");
}

const FIXTURE_BRIEF = {
  name: "LaunchWings",
  oneLiner: "pre-launch agent platform for solo founders",
  audience: "solo technical founders shipping a v1 SaaS",
  valueProp:
    "audits your landing page, writes drafts in your voice, schedules build-in-public posts",
  callToAction: "try the free audit at launchwings.com/audit",
};

interface ResponseShape {
  text: string;
  costUsdMicros: number;
  modelUsed: "openai:gpt-4o-mini";
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
}

function writeCassette(
  name: string,
  pairs: Array<{ req: LLMRequest; res: ResponseShape; tag?: string }>,
): void {
  const path = join(CASSETTES_DIR, `${name}.jsonl`);
  const lines: string[] = [];
  for (const { req, res, tag } of pairs) {
    const provider = req.model.startsWith("openai:") ? "openai" : "anthropic";
    const line = {
      ...(tag ? { tag } : {}),
      request: {
        provider,
        model: req.model,
        messagesHash: hashMessages(req),
      },
      response: res,
    };
    lines.push(JSON.stringify(line));
  }
  writeFileSync(path, lines.join("\n") + "\n");
  console.log(`wrote ${path} (${pairs.length} call(s))`);
}

// ---- Fixtures -------------------------------------------------------------

const MODEL: "openai:gpt-4o-mini" = "openai:gpt-4o-mini";

function makeReq(channel: "x" | "linkedin", count: number, samples: VoiceSample[]): LLMRequest {
  return {
    model: MODEL,
    system: buildSocialDraftSystemPrompt({ channel, voiceSamples: samples }),
    messages: [
      { role: "user", content: userMessageFor({ channel, brief: FIXTURE_BRIEF, count }) },
    ],
    maxOutputTokens: 1500,
    temperature: 0.4,
  };
}

// ---- 1. x-only-2-drafts ---------------------------------------------------

writeCassette("social-draft-x-only-2-drafts", [
  {
    req: makeReq("x", 2, FIXTURE_CORPUS),
    res: {
      text: JSON.stringify({
        drafts: [
          {
            body: "shipped today: launchwings audit. paste a url, get the launch-readiness checklist run live.\n\nthe bug class that started this: silently broken og images. now they fail loud, before merge.",
            charCount: 191,
          },
          {
            body: "we wrote the launch-readiness checklist. then we ran it on ourselves and it caught three live bugs we'd missed.\n\nfree at launchwings.com/audit.",
            charCount: 145,
          },
        ],
      }),
      costUsdMicros: 1200,
      modelUsed: MODEL,
      latencyMs: 350,
      inputTokens: 800,
      outputTokens: 220,
    },
  },
]);

// ---- 2. linkedin-only-1-draft --------------------------------------------

writeCassette("social-draft-linkedin-only-1-draft", [
  {
    req: makeReq("linkedin", 1, FIXTURE_CORPUS),
    res: {
      text: JSON.stringify({
        drafts: [
          {
            body: "shipped a small thing today: launchwings — pre-launch agent platform for solo founders.\n\nthe shape:\n\n— audit agent: paste your landing page url, get a launch-readiness scorecard in under a minute.\n— social-draft agent: writes posts in your voice from a product brief.\n— scheduling lands next.\n\nthe meta-bug that started this: we wrote the audit checklist, then forgot to run it on our own site. shipped a 404 og image to launch day. silent fail, green build.\n\nnow the audit blocks merge. dogfood loop closed.\n\ntry the free audit at launchwings.com/audit.",
            charCount: 612,
          },
        ],
      }),
      costUsdMicros: 1800,
      modelUsed: MODEL,
      latencyMs: 420,
      inputTokens: 850,
      outputTokens: 360,
    },
  },
]);

// ---- 3. multi-channel (x + linkedin) -------------------------------------

writeCassette("social-draft-multi-channel", [
  // Call 1: x channel
  {
    req: makeReq("x", 2, FIXTURE_CORPUS),
    res: {
      text: JSON.stringify({
        drafts: [
          {
            body: "shipped: the launchwings audit agent. paste a url, get a launch-readiness scorecard live.\n\ngithub.com/launchwings — try it free.",
            charCount: 130,
          },
          {
            body: "three silent-fail bugs we caught this week — broken og image, no-op posthog key, lying api 200. all green builds. all real.\n\nthe audit catches each one before merge.",
            charCount: 167,
          },
        ],
      }),
      costUsdMicros: 1100,
      modelUsed: MODEL,
      latencyMs: 320,
      inputTokens: 800,
      outputTokens: 210,
    },
  },
  // Call 2: linkedin channel
  {
    req: makeReq("linkedin", 2, FIXTURE_CORPUS),
    res: {
      text: JSON.stringify({
        drafts: [
          {
            body: "we built launchwings to keep solo founders from shipping silent-fail bugs to launch day.\n\nthe core surface today:\n\n— audit agent: launch-readiness scorecard for your landing page.\n— social-draft agent: posts in your voice, from a product brief.\n\ntry it free at launchwings.com/audit.",
            charCount: 305,
          },
          {
            body: "shipping a v1 saas? you have at least one silent-fail bug on your homepage right now. you just don't know it yet.\n\nthe three we caught on our own site this week:\n\n— og image pointed at a missing file. every share broken since launch.\n— posthog key unset in prod. analytics empty for days.\n— waitlist api returned ok when the email send threw.\n\nthe launchwings audit runs each of these as a synthetic probe before merge.",
            charCount: 449,
          },
        ],
      }),
      costUsdMicros: 1900,
      modelUsed: MODEL,
      latencyMs: 480,
      inputTokens: 870,
      outputTokens: 380,
    },
  },
]);

// ---- 4. output-schema-violation-then-retry-success -----------------------

writeCassette("social-draft-x-retry", [
  // Call 1: malformed JSON (LLM dropped a quote — parse fails)
  {
    req: makeReq("x", 1, FIXTURE_CORPUS),
    res: {
      text: `{"drafts": [{"body": "this is missing a closing quote..., "charCount": 30}]}`,
      costUsdMicros: 900,
      modelUsed: MODEL,
      latencyMs: 280,
      inputTokens: 800,
      outputTokens: 50,
    },
  },
  // Call 2: retry with assistant + correction message
  {
    req: {
      model: MODEL,
      system: buildSocialDraftSystemPrompt({ channel: "x", voiceSamples: FIXTURE_CORPUS }),
      messages: [
        { role: "user", content: userMessageFor({ channel: "x", brief: FIXTURE_BRIEF, count: 1 }) },
        {
          role: "assistant",
          content: `{"drafts": [{"body": "this is missing a closing quote..., "charCount": 30}]}`,
        },
        {
          role: "user",
          content: `Your last response failed to parse as valid JSON matching the required schema. Return ONLY the JSON object, no prose, no code fences.`,
        },
      ],
      maxOutputTokens: 1500,
      temperature: 0.2,
    },
    res: {
      text: JSON.stringify({
        drafts: [
          {
            body: "shipped: launchwings audit agent. paste a url, get the launch-readiness scorecard live.",
            charCount: 88,
          },
        ],
      }),
      costUsdMicros: 950,
      modelUsed: MODEL,
      latencyMs: 310,
      inputTokens: 850,
      outputTokens: 60,
    },
  },
]);

console.log("done.");
