import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runSocialDraftAgent,
  withCassette,
  type AgentHelpers,
  type SocialDraftPayload,
  type VoiceSample,
} from "../index";

// F2 PR1 social-draft agent tests.
//
// Cassette-replay drives every LLM call. The DB boundary is mocked at the
// drizzle insert chain (`tx.insert(table).values(row).returning(...)`); we
// don't spin up a real Postgres for these tests — defineAgent's RLS wiring
// is exercised separately by the runtime + tenant integration tests.
//
// Cases:
//   1. x-only-2-drafts            → single channel, 2 drafts in.
//   2. linkedin-only-1-draft      → single channel, 1 draft in (count=1).
//   3. multi-channel              → x + linkedin in one run.
//   4. x-retry                    → first response is malformed JSON; retry
//                                    once succeeds; both LLM calls hash-match.
// Plus copy-review compliance:
//   5. The drafts in case 1 contain none of the deny patterns from
//      apps/web/scripts/copy-review.config.json (live-loaded from disk).

const TENANT = "00000000-0000-0000-0000-000000000000";

// Same corpus the cassette generator uses. Keep in sync with
// scripts/gen-social-draft-cassettes.ts FIXTURE_CORPUS — the tests will
// hash-mismatch loudly if these drift.
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
  audience: "solo technical founders shipping a v1 SaaS",
  valueProp:
    "audits your landing page, writes drafts in your voice, schedules build-in-public posts",
  callToAction: "try the free audit at launchwings.com/audit",
};

interface InsertedRow {
  id: string;
  values: Record<string, unknown>;
}

function makeMockTx(): { tx: { insert: (...args: unknown[]) => unknown }; rows: InsertedRow[] } {
  const rows: InsertedRow[] = [];
  let counter = 0;
  // Drizzle's chain: db.insert(table).values(obj).returning({ id: ... })
  // We mimic just the surface the agent uses.
  const tx = {
    insert: (_table: unknown) => {
      return {
        values: (vals: Record<string, unknown>) => {
          counter += 1;
          const id = `00000000-0000-0000-0000-${counter.toString().padStart(12, "0")}`;
          rows.push({ id, values: vals });
          return {
            returning: async (_proj?: unknown) => [{ id }],
          };
        },
      };
    },
  } as unknown as { insert: (...args: unknown[]) => unknown };
  return { tx, rows };
}

function makeHelpers(): { helpers: AgentHelpers; logged: Record<string, unknown>[] } {
  const logged: Record<string, unknown>[] = [];
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

const baseMeta = (txAndRows: ReturnType<typeof makeMockTx>) => ({
  agentRunId: "agent-run-fixture-id",
  triggerRunId: "trigger-run-fixture-id",
  tenantId: TENANT,
  tx: txAndRows.tx as never,
  loadCorpus: () => FIXTURE_CORPUS,
  model: "openai:gpt-4o-mini" as const,
});

describe("runSocialDraftAgent — x-only, 2 drafts", () => {
  it("generates 2 drafts and persists each", async () => {
    const txAndRows = makeMockTx();
    const { helpers } = makeHelpers();
    const payload: SocialDraftPayload = {
      tenantId: TENANT,
      productBrief: FIXTURE_BRIEF,
      channels: ["x"],
      count: 2,
    };
    const result = await withCassette("social-draft-x-only-2-drafts", async () => {
      return runSocialDraftAgent(payload, helpers, baseMeta(txAndRows));
    });
    expect(result.drafts).toHaveLength(2);
    for (const d of result.drafts) {
      expect(d.channel).toBe("x");
      expect(d.charCount).toBe(d.body.length);
      expect(d.charCount).toBeLessThanOrEqual(280);
    }
    expect(txAndRows.rows).toHaveLength(2);
    expect(txAndRows.rows[0]?.values.tenantId).toBe(TENANT);
    expect(txAndRows.rows[0]?.values.channel).toBe("x");
    expect(txAndRows.rows[0]?.values.status).toBe("draft");
    expect(txAndRows.rows[0]?.values.bodyCharCount).toBe(
      (txAndRows.rows[0]?.values.bodyMd as string).length,
    );
  });
});

describe("runSocialDraftAgent — linkedin-only, 1 draft", () => {
  it("generates 1 LinkedIn draft within 3000-char limit", async () => {
    const txAndRows = makeMockTx();
    const { helpers } = makeHelpers();
    const payload: SocialDraftPayload = {
      tenantId: TENANT,
      productBrief: FIXTURE_BRIEF,
      channels: ["linkedin"],
      count: 1,
    };
    const result = await withCassette("social-draft-linkedin-only-1-draft", async () => {
      return runSocialDraftAgent(payload, helpers, baseMeta(txAndRows));
    });
    expect(result.drafts).toHaveLength(1);
    const draft = result.drafts[0]!;
    expect(draft.channel).toBe("linkedin");
    expect(draft.charCount).toBeLessThanOrEqual(3000);
    expect(txAndRows.rows[0]?.values.channel).toBe("linkedin");
  });
});

describe("runSocialDraftAgent — multi-channel (x + linkedin)", () => {
  it("runs both channels in order and persists drafts for each", async () => {
    const txAndRows = makeMockTx();
    const { helpers } = makeHelpers();
    const payload: SocialDraftPayload = {
      tenantId: TENANT,
      productBrief: FIXTURE_BRIEF,
      channels: ["x", "linkedin"],
      count: 2,
    };
    const result = await withCassette("social-draft-multi-channel", async () => {
      return runSocialDraftAgent(payload, helpers, baseMeta(txAndRows));
    });
    expect(result.drafts).toHaveLength(4);
    const channels = result.drafts.map((d) => d.channel);
    expect(channels.filter((c) => c === "x")).toHaveLength(2);
    expect(channels.filter((c) => c === "linkedin")).toHaveLength(2);
    for (const d of result.drafts) {
      const limit = d.channel === "x" ? 280 : 3000;
      expect(d.charCount).toBeLessThanOrEqual(limit);
    }
  });
});

describe("runSocialDraftAgent — schema violation, retry succeeds", () => {
  it("retries once after malformed JSON and returns the corrected draft", async () => {
    const txAndRows = makeMockTx();
    const { helpers, logged } = makeHelpers();
    const payload: SocialDraftPayload = {
      tenantId: TENANT,
      productBrief: FIXTURE_BRIEF,
      channels: ["x"],
      count: 1,
    };
    const result = await withCassette("social-draft-x-retry", async () => {
      return runSocialDraftAgent(payload, helpers, baseMeta(txAndRows));
    });
    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0]?.channel).toBe("x");
    // The retry path must have logged the parse failure.
    expect(
      logged.some((l) => l.message === "social_draft_parse_failed_retrying"),
    ).toBe(true);
  });
});

// Deliverable 6 — copy-review agent compliance.
describe("runSocialDraftAgent — copy-review compliance", () => {
  it("generated drafts contain none of the literal deny patterns", async () => {
    // Resolve copy-review.config.json from the repo root. We don't import the
    // scanner — just the config — so this test is independent of the web
    // app's runtime.
    const here = dirname(fileURLToPath(import.meta.url));
    // here = packages/agents/src/__tests__ → up 4 = repo root.
    const configPath = join(
      here,
      "..",
      "..",
      "..",
      "..",
      "apps",
      "web",
      "scripts",
      "copy-review.config.json",
    );
    const config = JSON.parse(readFileSync(configPath, "utf-8")) as {
      deny: Array<{ pattern: string; wholeWord?: boolean }>;
    };

    const txAndRows = makeMockTx();
    const { helpers } = makeHelpers();
    const payload: SocialDraftPayload = {
      tenantId: TENANT,
      productBrief: FIXTURE_BRIEF,
      channels: ["x"],
      count: 2,
    };
    const result = await withCassette("social-draft-x-only-2-drafts", async () => {
      return runSocialDraftAgent(payload, helpers, baseMeta(txAndRows));
    });
    const allBodies = result.drafts.map((d) => d.body.toLowerCase()).join("\n");
    for (const rule of config.deny) {
      const flags = "i";
      const body = rule.wholeWord ? `\\b(?:${rule.pattern})\\b` : `(?:${rule.pattern})`;
      const re = new RegExp(body, flags);
      expect(
        re.test(allBodies),
        `deny pattern matched: /${body}/${flags} in drafts:\n${allBodies}`,
      ).toBe(false);
    }
  });
});

// vi import retained for parity with sibling test files; not currently used.
void vi;
