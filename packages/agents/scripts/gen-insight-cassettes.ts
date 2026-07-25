// Cassette generator for the insight agent tests.
//
// Same approach as gen-social-draft-cassettes.ts: we hand-author the cassette
// fixtures and use this script to compute the messagesHash for each request
// pair. Run:
//
//   pnpm --filter @launchwings/agents tsx scripts/gen-insight-cassettes.ts
//
// Re-run whenever the system prompt or fixture KPI snapshots change; commit
// the result. The hash mismatch in replay mode is the signal that a prompt
// drifted.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { hashMessages } from "../src/cassettes/record";
import {
  INSIGHT_SYSTEM_PROMPT,
  buildInsightUserMessage,
  type KpiSnapshot,
} from "../src/tasks/insight";
import type { LLMRequest } from "../src/llm";

const HERE = dirname(fileURLToPath(import.meta.url));
const CASSETTES_DIR = join(HERE, "..", "cassettes");
mkdirSync(CASSETTES_DIR, { recursive: true });

const MODEL: "openai:gpt-4o-mini" = "openai:gpt-4o-mini";

interface ResponseShape {
  text: string;
  costUsdMicros: number;
  modelUsed: "openai:gpt-4o-mini";
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
}

function makeReq(briefFor: string, kpis: KpiSnapshot): LLMRequest {
  return {
    model: MODEL,
    system: INSIGHT_SYSTEM_PROMPT,
    messages: [
      { role: "user", content: buildInsightUserMessage({ briefFor, kpis }) },
    ],
    maxOutputTokens: 800,
    temperature: 0.3,
  };
}

function makeRetryReq(
  briefFor: string,
  kpis: KpiSnapshot,
  badAssistantText: string,
): LLMRequest {
  return {
    model: MODEL,
    system: INSIGHT_SYSTEM_PROMPT,
    messages: [
      { role: "user", content: buildInsightUserMessage({ briefFor, kpis }) },
      { role: "assistant", content: badAssistantText },
      {
        role: "user",
        content:
          "Your last response failed to parse as valid JSON matching {headline, recommendationMd}. Return ONLY the JSON object, no prose, no code fences.",
      },
    ],
    maxOutputTokens: 800,
    temperature: 0.2,
  };
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

// ---- 1. pre-launch (only audits, no signups yet) -------------------------

const PRE_LAUNCH_KPIS: KpiSnapshot = {
  audits: 2,
  draftsPending: 0,
  submissionsQueued: 0,
  paying: null,
  signups: 0,
  agentRuns: { succeeded: 5, failed: 0, running: 0 },
};

writeCassette("insight-pre-launch", [
  {
    req: makeReq("2026-05-08", PRE_LAUNCH_KPIS),
    res: {
      text: JSON.stringify({
        headline:
          "no waitlist signups yet — ship one new piece of build-in-public copy today.",
        recommendationMd:
          "you ran 2 audits this week and have 0 drafts pending, 0 signups, and no paying customers yet. the funnel is empty at the top.\n\npick one thing you fixed in the last 48 hours and post a 3-paragraph LinkedIn or X post about it. concrete bug + the fix + what it taught you. that's the one move that turns a quiet week into a top-of-funnel pulse.",
      }),
      costUsdMicros: 1100,
      modelUsed: MODEL,
      latencyMs: 320,
      inputTokens: 420,
      outputTokens: 180,
    },
  },
]);

// ---- 2. drafts pending — needs approval ---------------------------------

const DRAFTS_PENDING_KPIS: KpiSnapshot = {
  audits: 1,
  draftsPending: 4,
  submissionsQueued: 0,
  paying: null,
  signups: 3,
  agentRuns: { succeeded: 8, failed: 1, running: 0 },
};

writeCassette("insight-drafts-pending", [
  {
    req: makeReq("2026-05-08", DRAFTS_PENDING_KPIS),
    res: {
      text: JSON.stringify({
        headline:
          "4 social drafts are waiting for your review — approve or reject each one before generating more.",
        recommendationMd:
          "you have 4 drafts pending and 3 new waitlist signups in the last 7 days. nothing else is queued, and 1 agent run failed this week (worth a glance, but not today's priority).\n\nopen the drafts list and walk through all 4. approve the ones that sound like you; reject the ones that don't. an unread queue blocks the social scheduler from doing anything useful.",
      }),
      costUsdMicros: 1180,
      modelUsed: MODEL,
      latencyMs: 340,
      inputTokens: 430,
      outputTokens: 200,
    },
  },
]);

// ---- 3. submissions queued — needs follow-up -----------------------------

const SUBMISSIONS_QUEUED_KPIS: KpiSnapshot = {
  audits: 0,
  draftsPending: 0,
  submissionsQueued: 6,
  paying: null,
  signups: 12,
  agentRuns: { succeeded: 14, failed: 0, running: 1 },
};

writeCassette("insight-submissions-queued", [
  {
    req: makeReq("2026-05-08", SUBMISSIONS_QUEUED_KPIS),
    res: {
      text: JSON.stringify({
        headline:
          "6 directory submissions are queued — chase the ones that haven't responded in 5+ days.",
        recommendationMd:
          "you have 6 queued directory submissions, 12 fresh signups, and a clean agent-run record (14 succeeded, 0 failed). nothing else is pending review.\n\nopen the queued submissions list, sort by oldest, and send a one-line follow-up email on any that have been sitting more than 5 days. directory listings convert when you stay top-of-mind; silent queues rot.",
      }),
      costUsdMicros: 1240,
      modelUsed: MODEL,
      latencyMs: 360,
      inputTokens: 440,
      outputTokens: 210,
    },
  },
]);

// ---- 4. post-launch with paying customers --------------------------------

const POST_LAUNCH_KPIS: KpiSnapshot = {
  audits: 3,
  draftsPending: 1,
  submissionsQueued: 0,
  paying: 7,
  signups: 22,
  agentRuns: { succeeded: 24, failed: 2, running: 0 },
};

writeCassette("insight-post-launch", [
  {
    req: makeReq("2026-05-08", POST_LAUNCH_KPIS),
    res: {
      text: JSON.stringify({
        headline:
          "talk to one of your 7 paying customers today — retention beats more top-of-funnel.",
        recommendationMd:
          "you have 7 paying customers, 22 new signups, 1 draft pending, and 3 audits this week. 2 agent runs failed — worth a check after this, but not the headline.\n\npick one paying customer who signed up more than 14 days ago and book 15 minutes with them this week. ask: what almost made you cancel, and what almost made you upgrade. that conversation is worth more than another 50 signups right now.",
      }),
      costUsdMicros: 1300,
      modelUsed: MODEL,
      latencyMs: 380,
      inputTokens: 450,
      outputTokens: 220,
    },
  },
]);

console.log("done.");
