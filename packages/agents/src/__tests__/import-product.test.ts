import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ONB-01 (migration) — import-product Trigger.dev task unit tests.
//
// We test the pure run body (`runImportProduct`) via the same chain-level DB
// mock pattern that discovery.test / insight.test use. Firecrawl + Browserbase
// clients are mocked at the module boundary so we can drive each branch of
// the partial-success policy without real HTTP.
//
// Branches covered:
//   1. Both succeed       → metadata.extracted + metadata.screenshot, build-
//      platform row inserted, no metadata.import_error.
//   2. Firecrawl OK +     → metadata.extracted, NO screenshot,
//      Browserbase fail     metadata.import_error.stage === "browserbase",
//                           task does NOT throw.
//   3. Firecrawl fail     → metadata.import_error.stage === "firecrawl",
//                           task throws.

const TENANT = "00000000-0000-0000-0000-000000000000";
const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";
const URL_UNDER_TEST = "https://example.com";

beforeEach(() => {
  process.env.FIRECRAWL_API_KEY = "fc_test";
  process.env.BROWSERBASE_API_KEY = "bb_test";
  process.env.BROWSERBASE_PROJECT_ID = "proj_test";
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ----- Mocks --------------------------------------------------------------

vi.mock("@launchwings/db", async () => {
  const actual = await vi.importActual<typeof import("@launchwings/db")>(
    "@launchwings/db",
  );
  return {
    ...actual,
    dbPool: () => ({}) as never,
    withTenant: async (
      _db: unknown,
      _tenantId: string,
      cb: (tx: unknown) => unknown,
    ) => cb(currentMockTx),
  };
});

vi.mock("@launchwings/lrs", () => ({
  detectBuildPlatform: () => ({
    platform: "vercel" as const,
    confidence: 0.8,
    signals: { source: "test" },
  }),
}));

vi.mock("../clients/firecrawl", async () => {
  const actual = await vi.importActual<
    typeof import("../clients/firecrawl")
  >("../clients/firecrawl");
  return {
    ...actual,
    crawlSite: (...args: unknown[]) => firecrawlSpy(...args),
  };
});

vi.mock("../clients/browserbase", async () => {
  const actual = await vi.importActual<
    typeof import("../clients/browserbase")
  >("../clients/browserbase");
  return {
    ...actual,
    screenshotHomepage: (...args: unknown[]) => browserbaseSpy(...args),
  };
});

// ----- Shared mock state --------------------------------------------------

interface CapturedUpdate {
  setVals: Record<string, unknown>;
}
interface CapturedInsert {
  table: unknown;
  values: Record<string, unknown>;
}

let firecrawlSpy: (...args: unknown[]) => Promise<unknown>;
let browserbaseSpy: (...args: unknown[]) => Promise<unknown>;
let currentMockTx: unknown;
let captured: {
  selectRows: Array<Record<string, unknown>>;
  updates: CapturedUpdate[];
  inserts: CapturedInsert[];
};

function makeMockTx(productRow: Record<string, unknown>) {
  captured = { selectRows: [productRow], updates: [], inserts: [] };
  return {
    select: () => ({
      from: () => ({
        where: async () => captured.selectRows,
      }),
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => {
        captured.updates.push({ setVals: vals });
        return { where: async () => undefined };
      },
    }),
    insert: (table: unknown) => ({
      values: async (values: Record<string, unknown>) => {
        captured.inserts.push({ table, values });
        return undefined;
      },
    }),
  };
}

const PAYLOAD = {
  tenantId: TENANT,
  productId: PRODUCT_ID,
  url: URL_UNDER_TEST,
};

// ----- Tests --------------------------------------------------------------

describe("runImportProduct — partial success policy", () => {
  it("Firecrawl OK + Browserbase OK → metadata.extracted + screenshot, build-platform inserted", async () => {
    firecrawlSpy = vi.fn().mockResolvedValue({
      pages: [
        {
          url: URL_UNDER_TEST,
          html: "<html><head><title>Acme</title><meta name='description' content='desc'></head><body><h1>Hero</h1></body></html>",
          markdown: "# Acme",
          metadata: { sourceURL: URL_UNDER_TEST },
        },
      ],
    });
    browserbaseSpy = vi.fn().mockResolvedValue({
      pngBase64: "AAA",
      viewport: { width: 1280, height: 800 },
    });

    currentMockTx = makeMockTx({
      id: PRODUCT_ID,
      tenantId: TENANT,
      name: "stub",
      url: URL_UNDER_TEST,
      metadata: {},
    });

    const { runImportProduct } = await import("../tasks/import-product");
    const result = await runImportProduct(
      PAYLOAD,
      () => {},
      () => ({}) as never,
    );

    expect(firecrawlSpy).toHaveBeenCalledTimes(1);
    expect(browserbaseSpy).toHaveBeenCalledTimes(1);
    expect(captured.updates).toHaveLength(1);
    const meta = captured.updates[0]!.setVals.metadata as Record<string, unknown>;
    expect(meta.extracted).toBeDefined();
    expect(meta.screenshot).toBeDefined();
    expect(meta.import_error).toBeUndefined();
    expect(captured.inserts).toHaveLength(1);
    expect(result).toMatchObject({
      productId: PRODUCT_ID,
      screenshotCaptured: true,
    });
  });

  it("Firecrawl OK + Browserbase fail → metadata.extracted set, no screenshot, import_error.stage=browserbase, no throw", async () => {
    firecrawlSpy = vi.fn().mockResolvedValue({
      pages: [
        {
          url: URL_UNDER_TEST,
          html: "<html><body>ok</body></html>",
          markdown: "ok",
          metadata: { sourceURL: URL_UNDER_TEST },
        },
      ],
    });
    const { BrowserbaseError } = await import("../clients/browserbase");
    browserbaseSpy = vi
      .fn()
      .mockRejectedValue(new BrowserbaseError("timeout", "took too long"));

    currentMockTx = makeMockTx({
      id: PRODUCT_ID,
      tenantId: TENANT,
      name: "stub",
      url: URL_UNDER_TEST,
      metadata: {},
    });

    const { runImportProduct } = await import("../tasks/import-product");
    const result = await runImportProduct(
      PAYLOAD,
      () => {},
      () => ({}) as never,
    );

    // 2 attempts on Browserbase before giving up.
    expect(browserbaseSpy).toHaveBeenCalledTimes(2);
    expect(captured.updates).toHaveLength(1);
    const meta = captured.updates[0]!.setVals.metadata as Record<string, unknown>;
    expect(meta.extracted).toBeDefined();
    expect(meta.screenshot).toBeUndefined();
    const importError = meta.import_error as { stage: string };
    expect(importError.stage).toBe("browserbase");
    expect(captured.inserts).toHaveLength(1);
    expect(result).toMatchObject({
      productId: PRODUCT_ID,
      screenshotCaptured: false,
    });
  });

  it("Firecrawl fail (404 = non-retriable) → import_error.stage=firecrawl, task throws, browserbase not called", async () => {
    const { FirecrawlError } = await import("../clients/firecrawl");
    firecrawlSpy = vi
      .fn()
      .mockRejectedValue(new FirecrawlError("not_found", "404"));
    browserbaseSpy = vi.fn();

    currentMockTx = makeMockTx({
      id: PRODUCT_ID,
      tenantId: TENANT,
      name: "stub",
      url: URL_UNDER_TEST,
      metadata: {},
    });

    const { runImportProduct } = await import("../tasks/import-product");
    let threw = false;
    try {
      await runImportProduct(PAYLOAD, () => {}, () => ({}) as never);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    // metadata.import_error should have been written before the throw.
    const lastUpdate = captured.updates.at(-1);
    expect(lastUpdate).toBeDefined();
    const meta = lastUpdate!.setVals.metadata as Record<string, unknown>;
    const importError = meta.import_error as { stage: string };
    expect(importError.stage).toBe("firecrawl");
    expect(browserbaseSpy).not.toHaveBeenCalled();
  });
});
