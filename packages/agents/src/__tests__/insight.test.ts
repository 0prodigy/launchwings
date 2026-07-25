import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runInsightAgent,
  withCassette,
  type AgentHelpers,
  type InsightPayload,
  type KpiSnapshot,
} from "../index";

// F2 PR2 Insight Agent tests.
//
// Cassette-replay drives every LLM call. The DB boundary (insert + upsert) is
// mocked at the chain level — we don't spin up a real Postgres for unit
// tests. The KPI gather is overridden via meta.gather so we don't have to
// mock the per-table count queries; gatherKpis itself has its own integration
// test path (deferred to PR3 when we wire a Neon test branch).
//
// Cases:
//   1. pre-launch              — only audits, no signups yet.
//   2. drafts-pending          — needs founder approval.
//   3. submissions-queued      — needs follow-up.
//   4. post-launch             — paying customers (mocked).
// Plus:
//   5. structured JSON shape — the recommendationMd in case 1 has no deny
//      patterns from apps/web/scripts/copy-review.config.json.
//   6. system prompt sanity   — the LLM call carries INSIGHT_SYSTEM_PROMPT.

const TENANT = "00000000-0000-0000-0000-000000000000";
const BRIEF_FOR = "2026-05-08";

interface UpsertedRow {
  id: string;
  values: Record<string, unknown>;
  conflict: { target: unknown; set: Record<string, unknown> } | null;
}

// Drizzle's chain for an upsert is:
//   tx.insert(table)
//     .values(row)
//     .onConflictDoUpdate({ target, set })
//     .returning({ id: ... })
// We mock just that surface plus a no-op `select` so a future test that does
// real KPI gather still typechecks.
function makeMockTx(): { tx: unknown; rows: UpsertedRow[] } {
  const rows: UpsertedRow[] = [];
  let counter = 0;
  const tx = {
    insert: (_table: unknown) => ({
      values: (vals: Record<string, unknown>) => {
        counter += 1;
        const id = `00000000-0000-0000-0000-${counter.toString().padStart(12, "0")}`;
        const row: UpsertedRow = { id, values: vals, conflict: null };
        rows.push(row);
        return {
          // Chain branch 1: plain returning (no conflict handler).
          returning: async () => [{ id }],
          // Chain branch 2: onConflictDoUpdate then returning.
          onConflictDoUpdate: (
            args: { target: unknown; set: Record<string, unknown> },
          ) => {
            row.conflict = args;
            return {
              returning: async () => [{ id }],
            };
          },
        };
      },
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: async () => [] }),
        }),
      }),
    }),
  };
  return { tx, rows };
}

interface RecordedLlmCall {
  system?: string;
  messageRoles: string[];
  firstUser: string;
}

function makeHelpers(): {
  helpers: AgentHelpers;
  logged: Record<string, unknown>[];
  llmCalls: RecordedLlmCall[];
} {
  const logged: Record<string, unknown>[] = [];
  const llmCalls: RecordedLlmCall[] = [];
  const helpers: AgentHelpers = {
    llm: async (req) => {
      llmCalls.push({
        system: req.system,
        messageRoles: req.messages.map((m) => m.role),
        firstUser: req.messages.find((m) => m.role === "user")?.content ?? "",
      });
      const { llm } = await import("../llm");
      return llm(req);
    },
    logEvent: (line) => {
      logged.push(line);
    },
  };
  return { helpers, logged, llmCalls };
}

const baseMeta = (txAndRows: ReturnType<typeof makeMockTx>, kpis: KpiSnapshot) => ({
  agentRunId: "agent-run-fixture-id",
  triggerRunId: "trigger-run-fixture-id",
  tenantId: TENANT,
  tx: txAndRows.tx as never,
  gather: async () => kpis,
  model: "openai:gpt-4o-mini" as const,
});

const PAYLOAD: InsightPayload = {
  tenantId: TENANT,
  briefFor: BRIEF_FOR,
};

describe("runInsightAgent — pre-launch (only audits)", () => {
  it("produces a brief and upserts on (tenant, briefFor)", async () => {
    const txAndRows = makeMockTx();
    const { helpers, llmCalls } = makeHelpers();
    const kpis: KpiSnapshot = {
      audits: 2,
      draftsPending: 0,
      submissionsQueued: 0,
      paying: null,
      signups: 0,
      agentRuns: { succeeded: 5, failed: 0, running: 0 },
    };
    const result = await withCassette("insight-pre-launch", async () => {
      return runInsightAgent(PAYLOAD, helpers, baseMeta(txAndRows, kpis));
    });

    expect(result.briefFor).toBe(BRIEF_FOR);
    expect(result.degraded).toBe(false);
    expect(result.headline.length).toBeGreaterThan(0);
    expect(result.recommendationMd.length).toBeGreaterThan(0);
    expect(result.kpis).toEqual(kpis);

    // Persistence: one upsert with the right shape and conflict target.
    expect(txAndRows.rows).toHaveLength(1);
    const row = txAndRows.rows[0]!;
    expect(row.values.tenantId).toBe(TENANT);
    expect(row.values.briefFor).toBe(BRIEF_FOR);
    expect(row.values.headline).toBe(result.headline);
    expect(row.values.recommendationMd).toBe(result.recommendationMd);
    expect(row.values.kpisJson).toEqual(kpis);
    expect(row.conflict).not.toBeNull();
    // The conflict target must be the (tenant, briefFor) pair so re-running
    // for the same UTC day overwrites in place.
    expect(Array.isArray(row.conflict?.target)).toBe(true);
    expect(row.conflict?.set.headline).toBe(result.headline);
    // read_at is reset on overwrite.
    expect(row.conflict?.set.readAt).toBeNull();

    // LLM call sanity: exactly one call, system prompt populated.
    expect(llmCalls).toHaveLength(1);
    expect(llmCalls[0]?.system).toContain("LaunchWings Insight Agent");
    expect(llmCalls[0]?.firstUser).toContain(`Date (UTC): ${BRIEF_FOR}`);
  });
});

describe("runInsightAgent — drafts pending, needs approval", () => {
  it("recommends approving the queued drafts", async () => {
    const txAndRows = makeMockTx();
    const { helpers } = makeHelpers();
    const kpis: KpiSnapshot = {
      audits: 1,
      draftsPending: 4,
      submissionsQueued: 0,
      paying: null,
      signups: 3,
      agentRuns: { succeeded: 8, failed: 1, running: 0 },
    };
    const result = await withCassette("insight-drafts-pending", async () => {
      return runInsightAgent(PAYLOAD, helpers, baseMeta(txAndRows, kpis));
    });
    expect(result.degraded).toBe(false);
    // The headline should reference drafts. Cassette is hand-authored to
    // satisfy decision priority #1 in the system prompt.
    expect(result.headline.toLowerCase()).toContain("draft");
    expect(result.recommendationMd).toContain("4");
  });
});

describe("runInsightAgent — submissions queued, needs follow-up", () => {
  it("recommends chasing queued submissions", async () => {
    const txAndRows = makeMockTx();
    const { helpers } = makeHelpers();
    const kpis: KpiSnapshot = {
      audits: 0,
      draftsPending: 0,
      submissionsQueued: 6,
      paying: null,
      signups: 12,
      agentRuns: { succeeded: 14, failed: 0, running: 1 },
    };
    const result = await withCassette("insight-submissions-queued", async () => {
      return runInsightAgent(PAYLOAD, helpers, baseMeta(txAndRows, kpis));
    });
    expect(result.degraded).toBe(false);
    expect(result.headline.toLowerCase()).toContain("submission");
    expect(result.recommendationMd).toContain("6");
  });
});

describe("runInsightAgent — post-launch with paying customers", () => {
  it("pivots to retention work", async () => {
    const txAndRows = makeMockTx();
    const { helpers } = makeHelpers();
    const kpis: KpiSnapshot = {
      audits: 3,
      draftsPending: 1,
      submissionsQueued: 0,
      paying: 7,
      signups: 22,
      agentRuns: { succeeded: 24, failed: 2, running: 0 },
    };
    const result = await withCassette("insight-post-launch", async () => {
      return runInsightAgent(PAYLOAD, helpers, baseMeta(txAndRows, kpis));
    });
    expect(result.degraded).toBe(false);
    expect(result.headline.toLowerCase()).toMatch(/customer|retention|paying/);
    // Should reference at least one snapshot number.
    expect(result.recommendationMd).toContain("7");
  });
});

// Deliverable 6 — copy-review compliance.
describe("runInsightAgent — copy-review compliance", () => {
  it("recommendationMd contains none of the deny patterns", async () => {
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

    // Run all four cassette cases and concatenate the resulting bodies — the
    // founder reads the brief verbatim, so EVERY brief must pass.
    const allOutputs: string[] = [];
    const cases: Array<{ name: string; kpis: KpiSnapshot }> = [
      {
        name: "insight-pre-launch",
        kpis: {
          audits: 2,
          draftsPending: 0,
          submissionsQueued: 0,
          paying: null,
          signups: 0,
          agentRuns: { succeeded: 5, failed: 0, running: 0 },
        },
      },
      {
        name: "insight-drafts-pending",
        kpis: {
          audits: 1,
          draftsPending: 4,
          submissionsQueued: 0,
          paying: null,
          signups: 3,
          agentRuns: { succeeded: 8, failed: 1, running: 0 },
        },
      },
      {
        name: "insight-submissions-queued",
        kpis: {
          audits: 0,
          draftsPending: 0,
          submissionsQueued: 6,
          paying: null,
          signups: 12,
          agentRuns: { succeeded: 14, failed: 0, running: 1 },
        },
      },
      {
        name: "insight-post-launch",
        kpis: {
          audits: 3,
          draftsPending: 1,
          submissionsQueued: 0,
          paying: 7,
          signups: 22,
          agentRuns: { succeeded: 24, failed: 2, running: 0 },
        },
      },
    ];
    for (const c of cases) {
      const txAndRows = makeMockTx();
      const { helpers } = makeHelpers();
      const r = await withCassette(c.name, async () =>
        runInsightAgent(PAYLOAD, helpers, baseMeta(txAndRows, c.kpis)),
      );
      allOutputs.push(r.headline.toLowerCase(), r.recommendationMd.toLowerCase());
    }
    const blob = allOutputs.join("\n");
    for (const rule of config.deny) {
      const flags = "i";
      const body = rule.wholeWord ? `\\b(?:${rule.pattern})\\b` : `(?:${rule.pattern})`;
      const re = new RegExp(body, flags);
      expect(
        re.test(blob),
        `deny pattern matched: /${body}/${flags} in:\n${blob}`,
      ).toBe(false);
    }
  });
});

// vi import retained for parity with sibling test files.
void vi;
