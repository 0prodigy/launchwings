// F2 PR1 directory-submitter agent tests.
//
// Cassette-replay drives every LLM call. The DB boundary is mocked at the
// drizzle insert chain (`tx.insert(table).values(row).returning(...)`). The
// catalog is injected via `loadCatalog` so the tests don't depend on the
// canonical DIRECTORY_CATALOG list (which the founder may grow over time).
//
// Cases:
//   1. single-directory-form           → product-hunt (browser_form). Plain
//                                          fields mapped 1:1; tagline + description
//                                          generated via LLM. Status="draft".
//   2. single-directory-api            → test-only api directory. Status="draft".
//   3. single-directory-manual         → hacker-news / Show HN. Status="needs_manual".
//   4. multi-directory-mixed-kinds     → product-hunt + hacker-news + test-api.
//                                          Three rows, three different statuses.
//   5. payload-too-long-truncate-warn  → blurb >maxLength → truncated, warn logged.
// Plus catalog assertions in __tests__/directories/catalog.test.ts.
//
// Copy-review compliance test (Deliverable 6) is the last describe block.

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runDirectorySubmitterAgent,
  withCassette,
  type AgentHelpers,
  type DirectorySubmitterPayload,
  type VoiceSample,
} from "../index";
import { DIRECTORY_CATALOG, type DirectoryCatalogEntry } from "../directories/catalog";
import {
  FIXTURE_BRIEF,
  FIXTURE_CORPUS,
  TEST_API_DIRECTORY,
  TEST_TRUNCATE_DIRECTORY,
} from "../../scripts/gen-directory-submitter-cassettes";

const TENANT = "00000000-0000-0000-0000-000000000000";

interface InsertedRow {
  id: string;
  values: Record<string, unknown>;
}

function makeMockTx(): {
  tx: { insert: (...args: unknown[]) => unknown };
  rows: InsertedRow[];
} {
  const rows: InsertedRow[] = [];
  let counter = 0;
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

const baseMeta = (
  txAndRows: ReturnType<typeof makeMockTx>,
  catalog?: ReadonlyArray<DirectoryCatalogEntry>,
) => ({
  agentRunId: "agent-run-fixture-id",
  triggerRunId: "trigger-run-fixture-id",
  tenantId: TENANT,
  tx: txAndRows.tx as never,
  loadCorpus: () => FIXTURE_CORPUS,
  ...(catalog ? { loadCatalog: () => catalog } : {}),
  model: "openai:gpt-4o-mini" as const,
});

// product-hunt is a canonical catalog entry; we look it up to drive Test 1
// and the multi-directory case. If someone removes product-hunt from the
// catalog the lookup throws — failure points here.
function lookup(slug: string): DirectoryCatalogEntry {
  const e = DIRECTORY_CATALOG.find((d) => d.slug === slug);
  if (!e) throw new Error(`test fixture: missing catalog entry ${slug}`);
  return e;
}

describe("runDirectorySubmitterAgent — single-directory-form (product-hunt)", () => {
  it("prepares product-hunt with status=draft and LLM-generated tagline + description", async () => {
    const txAndRows = makeMockTx();
    const { helpers } = makeHelpers();
    const payload: DirectorySubmitterPayload = {
      tenantId: TENANT,
      productBrief: FIXTURE_BRIEF,
      directorySlugs: ["product-hunt"],
    };
    const result = await withCassette("directory-submitter-product-hunt", async () => {
      return runDirectorySubmitterAgent(payload, helpers, baseMeta(txAndRows));
    });

    expect(result.prepared).toHaveLength(1);
    const ph = result.prepared[0]!;
    expect(ph.slug).toBe("product-hunt");
    expect(ph.status).toBe("draft");
    expect(ph.payload.name).toBe(FIXTURE_BRIEF.name);
    expect(ph.payload.url).toBe(FIXTURE_BRIEF.url);
    expect(ph.payload.logo_url).toBe(FIXTURE_BRIEF.logoUrl);
    expect(ph.payload.screenshot_url).toBe(FIXTURE_BRIEF.screenshotUrl);
    expect(typeof ph.payload.tagline).toBe("string");
    expect((ph.payload.tagline as string).length).toBeLessThanOrEqual(60);
    expect(typeof ph.payload.description).toBe("string");
    expect((ph.payload.description as string).length).toBeLessThanOrEqual(260);

    expect(txAndRows.rows).toHaveLength(1);
    expect(txAndRows.rows[0]?.values.tenantId).toBe(TENANT);
    expect(txAndRows.rows[0]?.values.directorySlug).toBe("product-hunt");
    expect(txAndRows.rows[0]?.values.automationKind).toBe("browser_form");
    expect(txAndRows.rows[0]?.values.status).toBe("draft");
  });
});

describe("runDirectorySubmitterAgent — single-directory-api (mocked)", () => {
  it("prepares an api directory with status=draft (PR1 doesn't actually submit)", async () => {
    const txAndRows = makeMockTx();
    const { helpers } = makeHelpers();
    // Inject a test-only catalog with just the api directory.
    const payload: DirectorySubmitterPayload = {
      tenantId: TENANT,
      productBrief: FIXTURE_BRIEF,
      directorySlugs: ["test-api-directory"],
    };
    const result = await withCassette("directory-submitter-api-directory", async () => {
      return runDirectorySubmitterAgent(
        payload,
        helpers,
        baseMeta(txAndRows, [TEST_API_DIRECTORY]),
      );
    });
    expect(result.prepared).toHaveLength(1);
    expect(result.prepared[0]?.slug).toBe("test-api-directory");
    expect(result.prepared[0]?.status).toBe("draft");
    expect(txAndRows.rows[0]?.values.automationKind).toBe("api");
  });
});

describe("runDirectorySubmitterAgent — single-directory-manual (Show HN)", () => {
  it("prepares hacker-news with status=needs_manual", async () => {
    const txAndRows = makeMockTx();
    const { helpers } = makeHelpers();
    const payload: DirectorySubmitterPayload = {
      tenantId: TENANT,
      productBrief: FIXTURE_BRIEF,
      directorySlugs: ["hacker-news"],
    };
    const result = await withCassette("directory-submitter-hacker-news", async () => {
      return runDirectorySubmitterAgent(payload, helpers, baseMeta(txAndRows));
    });
    expect(result.prepared).toHaveLength(1);
    const hn = result.prepared[0]!;
    expect(hn.slug).toBe("hacker-news");
    expect(hn.status).toBe("needs_manual");
    expect(hn.payload.url).toBe(FIXTURE_BRIEF.url);
    expect(typeof hn.payload.title).toBe("string");
    expect((hn.payload.title as string).startsWith("Show HN:")).toBe(true);
    expect(typeof hn.payload.first_comment).toBe("string");
    expect(txAndRows.rows[0]?.values.automationKind).toBe("manual");
    expect(txAndRows.rows[0]?.values.status).toBe("needs_manual");
  });
});

describe("runDirectorySubmitterAgent — multi-directory-mixed-kinds", () => {
  it("prepares 3 rows with three different statuses across automation kinds", async () => {
    const txAndRows = makeMockTx();
    const { helpers } = makeHelpers();
    const productHunt = lookup("product-hunt");
    const hn = lookup("hacker-news");
    // Catalog injection — strict order so the agent walks them in the same
    // order as our cassette pairs (product-hunt, hacker-news, test-api).
    const catalog: DirectoryCatalogEntry[] = [productHunt, hn, TEST_API_DIRECTORY];
    const payload: DirectorySubmitterPayload = {
      tenantId: TENANT,
      productBrief: FIXTURE_BRIEF,
      directorySlugs: ["product-hunt", "hacker-news", "test-api-directory"],
    };
    const result = await withCassette("directory-submitter-multi-mixed", async () => {
      return runDirectorySubmitterAgent(payload, helpers, baseMeta(txAndRows, catalog));
    });
    expect(result.prepared).toHaveLength(3);
    expect(result.prepared.map((p) => p.slug)).toEqual([
      "product-hunt",
      "hacker-news",
      "test-api-directory",
    ]);
    expect(result.prepared.map((p) => p.status)).toEqual([
      "draft",
      "needs_manual",
      "draft",
    ]);
    expect(txAndRows.rows).toHaveLength(3);
  });
});

describe("runDirectorySubmitterAgent — payload-too-long → truncate + warn", () => {
  it("truncates over-limit blurbs and logs a warning", async () => {
    const txAndRows = makeMockTx();
    const { helpers, logged } = makeHelpers();
    const payload: DirectorySubmitterPayload = {
      tenantId: TENANT,
      productBrief: FIXTURE_BRIEF,
      directorySlugs: ["test-truncate-directory"],
    };
    const result = await withCassette("directory-submitter-truncate", async () => {
      return runDirectorySubmitterAgent(
        payload,
        helpers,
        baseMeta(txAndRows, [TEST_TRUNCATE_DIRECTORY]),
      );
    });
    expect(result.prepared).toHaveLength(1);
    const tagline = result.prepared[0]?.payload.tagline as string;
    expect(tagline.length).toBeLessThanOrEqual(20);
    // The cassette response is 60 chars; the agent must have truncated.
    expect(tagline.length).toBeLessThan(60);
    expect(
      logged.some((l) => l.message === "directory_blurb_over_limit_truncating"),
    ).toBe(true);
  });
});

// Deliverable 6 — copy-review compliance.
describe("runDirectorySubmitterAgent — copy-review compliance", () => {
  it("generated payloads contain none of the literal deny patterns", async () => {
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
    const payload: DirectorySubmitterPayload = {
      tenantId: TENANT,
      productBrief: FIXTURE_BRIEF,
      directorySlugs: ["product-hunt"],
    };
    const result = await withCassette("directory-submitter-product-hunt", async () => {
      return runDirectorySubmitterAgent(payload, helpers, baseMeta(txAndRows));
    });

    // Concatenate every string value in every prepared payload (LLM output +
    // plain mappings — both go to the directory).
    const allText = result.prepared
      .map((p) =>
        Object.values(p.payload)
          .filter((v): v is string => typeof v === "string")
          .join("\n"),
      )
      .join("\n")
      .toLowerCase();

    for (const rule of config.deny) {
      const flags = "i";
      const body = rule.wholeWord ? `\\b(?:${rule.pattern})\\b` : `(?:${rule.pattern})`;
      const re = new RegExp(body, flags);
      expect(
        re.test(allText),
        `deny pattern matched: /${body}/${flags} in payloads:\n${allText}`,
      ).toBe(false);
    }
  });
});

void vi;
