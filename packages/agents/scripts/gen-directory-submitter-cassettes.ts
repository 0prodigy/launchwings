// F2 PR1 — cassette generator for directorySubmitterAgent tests.
//
// Mirrors gen-social-draft-cassettes.ts. We hand-author response strings,
// compute messagesHash for each (system, messages) pair the agent will issue,
// and write cassette JSONL files.
//
// Run:
//   pnpm --filter @launchwings/agents tsx scripts/gen-directory-submitter-cassettes.ts
//
// Re-run whenever the system prompt builder, the directory catalog entries
// referenced here, or the FIXTURE_BRIEF changes; commit the result.
//
// IMPORTANT: the (system, messages) pairs we synthesise here MUST match what
// runDirectorySubmitterAgent → generateBlurb actually issues at runtime. If
// the agent code drifts the cassette will hash-mismatch and the failure will
// point here.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hashMessages } from "../src/cassettes/record";
import {
  buildSocialDraftSystemPrompt,
  type VoiceSample,
} from "../src/voice";
import {
  DIRECTORY_CATALOG,
  type DirectoryCatalogEntry,
  type DirectoryFieldSpec,
} from "../src/directories/catalog";
import type { LLMRequest } from "../src/llm";

const HERE = dirname(fileURLToPath(import.meta.url));
const CASSETTES_DIR = join(HERE, "..", "cassettes");
mkdirSync(CASSETTES_DIR, { recursive: true });

// ---- Fixtures (must match the test file's fixtures EXACTLY) ---------------

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

const FIXTURE_BRIEF = {
  name: "LaunchWings",
  oneLiner: "pre-launch agent platform for solo founders",
  longDescription:
    "LaunchWings runs the launch-readiness checklist on your landing page, prepares directory submissions in your voice, and drafts build-in-public posts. solo founder tooling, dogfooded.",
  url: "https://launchwings.com",
  audience: "solo technical founders shipping a v1 SaaS",
  valueProp:
    "audits your landing page, writes drafts in your voice, schedules build-in-public posts",
  pricingHint: "freemium",
  launchDate: "2026-06-01",
  screenshotUrl: "https://launchwings.com/og.png",
  logoUrl: "https://launchwings.com/logo.png",
  categoryHint: "developer-tools",
  founderEmail: "founder@launchwings.com",
};

// A test-only api directory. We can't use a real API directory in PR1
// (no keys / vendors), but the agent's behaviour for `automation_kind: "api"`
// is identical to "browser_form" until PR2 wires the worker — both stay in
// `draft`. The test catalog injects this entry so we can exercise the
// "single-directory-api" path without adding a real api row to the canonical
// catalog.
const TEST_API_DIRECTORY: DirectoryCatalogEntry = {
  slug: "test-api-directory",
  name: "Test API Directory",
  submissionUrl: "https://example.com/submit-api",
  automationKind: "api",
  category: "directory",
  instructionsMd:
    "Test-only directory entry. Used by directory-submitter unit tests; not part of the canonical catalog.",
  fieldSchemaJson: {
    fields: [
      {
        key: "name",
        label: "Product name",
        type: "text",
        maxLength: 60,
        required: true,
      },
      {
        key: "tagline",
        label: "Tagline",
        type: "text",
        maxLength: 80,
        required: true,
      },
    ],
  },
  enabled: true,
};

// A test-only directory whose maxLength is small enough that the LLM response
// (when we simulate a too-long answer) needs truncating.
const TEST_TRUNCATE_DIRECTORY: DirectoryCatalogEntry = {
  slug: "test-truncate-directory",
  name: "Test Truncate Directory",
  submissionUrl: "https://example.com/submit-truncate",
  automationKind: "browser_form",
  category: "directory",
  instructionsMd:
    "Test-only directory with a tight tagline limit; exercises the over-limit truncation path.",
  fieldSchemaJson: {
    fields: [
      {
        key: "tagline",
        label: "Tagline",
        type: "text",
        // Intentionally tiny — the LLM stub returns a longer string.
        maxLength: 20,
        required: true,
      },
    ],
  },
  enabled: true,
};

// ---- Helpers --------------------------------------------------------------

const MODEL: "openai:gpt-4o-mini" = "openai:gpt-4o-mini";

// Mirror generateBlurb's prompt assembly exactly. If runDirectorySubmitterAgent
// drifts, the test cassette hashes will mismatch and the failure points here.
function makeBlurbReq(
  directory: DirectoryCatalogEntry,
  field: DirectoryFieldSpec,
  voiceSamples: VoiceSample[],
): LLMRequest {
  const max = field.maxLength ?? 500;

  const systemBase = buildSocialDraftSystemPrompt({
    channel: "linkedin",
    voiceSamples,
  });

  const directoryBlock = [
    "",
    "You are NOT writing a social-media post. You are filling exactly one",
    `field on a directory submission for "${directory.name}".`,
    "",
    `Directory context: ${directory.instructionsMd}`,
    "",
    `Field: "${field.label}" (key: ${field.key}).`,
    `Hard limit: ${max} characters. Stay STRICTLY under this; do not include the limit number in your output.`,
    "",
    "Output ONLY the field text. No JSON. No code fences. No labels. No markdown.",
  ].join("\n");

  const system = systemBase + "\n\n" + directoryBlock;

  const brief = FIXTURE_BRIEF;
  const userMessage = [
    `Generate the "${field.label}" copy for the directory submission.`,
    ``,
    `Product name: ${brief.name}`,
    `One-liner: ${brief.oneLiner}`,
    `URL: ${brief.url}`,
    `Audience: ${brief.audience}`,
    `Value prop: ${brief.valueProp}`,
    `Long description: ${brief.longDescription}`,
    brief.pricingHint ? `Pricing: ${brief.pricingHint}` : null,
    brief.categoryHint ? `Category: ${brief.categoryHint}` : null,
    ``,
    `Return ONLY the field text. Stay under ${max} characters.`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    model: MODEL,
    system,
    messages: [{ role: "user", content: userMessage }],
    maxOutputTokens: Math.max(256, Math.ceil(max / 2)),
    temperature: 0.4,
  };
}

interface ResponseShape {
  text: string;
  costUsdMicros: number;
  modelUsed: "openai:gpt-4o-mini";
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
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

// Look up canonical entries by slug — mirrors the agent's catalog access.
function need(slug: string): DirectoryCatalogEntry {
  const e = DIRECTORY_CATALOG.find((d) => d.slug === slug);
  if (!e) throw new Error(`gen: missing catalog entry for ${slug}`);
  return e;
}

// ---- 1. single-directory-form (product-hunt) -----------------------------
//
// product-hunt fields: name(text,40) tagline(text,60) description(longtext,260)
//                      url logo_url screenshot_url topics(text,120) launch_date
// Plain (no LLM): name, url, logo_url, screenshot_url, topics, launch_date
// LLM: tagline, description

const productHunt = need("product-hunt");
const phTagline = productHunt.fieldSchemaJson.fields.find((f) => f.key === "tagline")!;
const phDescription = productHunt.fieldSchemaJson.fields.find((f) => f.key === "description")!;

writeCassette("directory-submitter-product-hunt", [
  {
    req: makeBlurbReq(productHunt, phTagline, FIXTURE_CORPUS),
    res: {
      text: "the launch-readiness platform for solo founders",
      costUsdMicros: 800,
      modelUsed: MODEL,
      latencyMs: 240,
      inputTokens: 700,
      outputTokens: 18,
    },
  },
  {
    req: makeBlurbReq(productHunt, phDescription, FIXTURE_CORPUS),
    res: {
      text: "launchwings audits your landing page, writes directory submissions in your voice, and drafts build-in-public posts. solo founder tooling, dogfooded on its own homepage. paste a url, get a launch-readiness scorecard.",
      costUsdMicros: 1500,
      modelUsed: MODEL,
      latencyMs: 380,
      inputTokens: 720,
      outputTokens: 95,
    },
  },
]);

// ---- 2. single-directory-api (test-api-directory) ------------------------
//
// fields: name(text,60), tagline(text,80)
// Plain: name. LLM: tagline.

const apiTagline = TEST_API_DIRECTORY.fieldSchemaJson.fields.find((f) => f.key === "tagline")!;

writeCassette("directory-submitter-api-directory", [
  {
    req: makeBlurbReq(TEST_API_DIRECTORY, apiTagline, FIXTURE_CORPUS),
    res: {
      text: "pre-launch agent platform for solo founders",
      costUsdMicros: 700,
      modelUsed: MODEL,
      latencyMs: 220,
      inputTokens: 700,
      outputTokens: 14,
    },
  },
]);

// ---- 3. single-directory-manual (hacker-news / Show HN) ------------------
//
// fields: title(text,80), url, first_comment(longtext,1500)
// Plain: url. LLM: title, first_comment.

const hn = need("hacker-news");
const hnTitle = hn.fieldSchemaJson.fields.find((f) => f.key === "title")!;
const hnFirstComment = hn.fieldSchemaJson.fields.find((f) => f.key === "first_comment")!;

writeCassette("directory-submitter-hacker-news", [
  {
    req: makeBlurbReq(hn, hnTitle, FIXTURE_CORPUS),
    res: {
      text: "Show HN: LaunchWings – pre-launch agent platform for solo founders",
      costUsdMicros: 700,
      modelUsed: MODEL,
      latencyMs: 230,
      inputTokens: 700,
      outputTokens: 22,
    },
  },
  {
    req: makeBlurbReq(hn, hnFirstComment, FIXTURE_CORPUS),
    res: {
      text: "we built launchwings to keep solo founders from shipping silent-fail bugs to launch day. paste your url, get a launch-readiness scorecard. happy to answer questions about how the orchestration agents work — directory submissions are next.",
      costUsdMicros: 1400,
      modelUsed: MODEL,
      latencyMs: 360,
      inputTokens: 720,
      outputTokens: 80,
    },
  },
]);

// ---- 4. multi-directory mixed kinds --------------------------------------
//
// product-hunt (browser_form) + hacker-news (manual) + test-api-directory (api).
// Total LLM calls = 2 (PH tagline + description) + 2 (HN title + comment) + 1 (api tagline) = 5

writeCassette("directory-submitter-multi-mixed", [
  {
    req: makeBlurbReq(productHunt, phTagline, FIXTURE_CORPUS),
    res: {
      text: "the launch-readiness platform for solo founders",
      costUsdMicros: 800,
      modelUsed: MODEL,
      latencyMs: 240,
      inputTokens: 700,
      outputTokens: 18,
    },
  },
  {
    req: makeBlurbReq(productHunt, phDescription, FIXTURE_CORPUS),
    res: {
      text: "launchwings audits your landing page, writes directory submissions in your voice, and drafts build-in-public posts. solo founder tooling, dogfooded on its own homepage. paste a url, get a launch-readiness scorecard.",
      costUsdMicros: 1500,
      modelUsed: MODEL,
      latencyMs: 380,
      inputTokens: 720,
      outputTokens: 95,
    },
  },
  {
    req: makeBlurbReq(hn, hnTitle, FIXTURE_CORPUS),
    res: {
      text: "Show HN: LaunchWings – pre-launch agent platform for solo founders",
      costUsdMicros: 700,
      modelUsed: MODEL,
      latencyMs: 230,
      inputTokens: 700,
      outputTokens: 22,
    },
  },
  {
    req: makeBlurbReq(hn, hnFirstComment, FIXTURE_CORPUS),
    res: {
      text: "we built launchwings to keep solo founders from shipping silent-fail bugs to launch day. paste your url, get a launch-readiness scorecard. happy to answer questions about how the orchestration agents work — directory submissions are next.",
      costUsdMicros: 1400,
      modelUsed: MODEL,
      latencyMs: 360,
      inputTokens: 720,
      outputTokens: 80,
    },
  },
  {
    req: makeBlurbReq(TEST_API_DIRECTORY, apiTagline, FIXTURE_CORPUS),
    res: {
      text: "pre-launch agent platform for solo founders",
      costUsdMicros: 700,
      modelUsed: MODEL,
      latencyMs: 220,
      inputTokens: 700,
      outputTokens: 14,
    },
  },
]);

// ---- 5. payload-too-long-truncate-and-warn -------------------------------
//
// test-truncate-directory has a tagline maxLength of 20.
// Our cassette returns a 60-char string; the agent must truncate and log
// "directory_blurb_over_limit_truncating".

const truncateTagline = TEST_TRUNCATE_DIRECTORY.fieldSchemaJson.fields[0]!;
writeCassette("directory-submitter-truncate", [
  {
    req: makeBlurbReq(TEST_TRUNCATE_DIRECTORY, truncateTagline, FIXTURE_CORPUS),
    res: {
      // 60 chars — the agent must truncate to 20.
      text: "this tagline is much too long to fit in the field maxLength",
      costUsdMicros: 800,
      modelUsed: MODEL,
      latencyMs: 250,
      inputTokens: 700,
      outputTokens: 20,
    },
  },
]);

console.log("done.");

// Re-export the test fixtures so the unit test file imports them by ESM
// instead of duplicating the literals (drift is the bug-class this prevents).
export { FIXTURE_CORPUS, FIXTURE_BRIEF, TEST_API_DIRECTORY, TEST_TRUNCATE_DIRECTORY };
