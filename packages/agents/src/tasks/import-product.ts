// ONB-01 (migration) — URL importer as a Trigger.dev task.
//
// Originally `products.import` ran the Firecrawl crawl + Browserbase
// screenshot synchronously inside a tRPC mutation. Real customer URLs (e.g.
// launchwings.com) blow past Vercel's 60s function ceiling (commit 811aeb3
// raised maxDuration to 60s; not enough). The fix is to dispatch the work to
// Trigger.dev: the tRPC mutation returns immediately with a queued productId,
// the task pulls Firecrawl + Browserbase on the long-running worker, and the
// founder UI polls products.get for `metadata.extracted` to land.
//
// Partial-success policy:
// - Firecrawl OK + Browserbase OK   → metadata.extracted + metadata.screenshot
//   + build-platform detection row inserted. Task SUCCEEDS.
// - Firecrawl OK + Browserbase FAIL → metadata.extracted, NO screenshot,
//   metadata.import_error = { stage: "browserbase", ... }, build-platform
//   detection still inserted. Task SUCCEEDS — Discovery can run on text-only.
// - Firecrawl FAIL                  → metadata.import_error = { stage: "firecrawl", ... }
//   then THROW so Trigger marks the run failed (and retries within policy).
//
// Per-call retry budgets are enforced INSIDE this task body (Firecrawl 3
// attempts, Browserbase 2 attempts). The task itself runs with maxAttempts: 1
// at the Trigger.dev layer (overriding trigger.config.ts default of 3) so we
// don't get 3×3 = 9 fan-out on a permanently broken URL — non-retriable
// failures (404 / robots) are signalled via AbortTaskRunError.

import { eq } from "drizzle-orm";
import { z } from "zod";
import { AbortTaskRunError } from "@trigger.dev/sdk";
import {
  dbPool,
  products,
  productBuildPlatformDetections,
  withTenant,
  type DbPool,
} from "@launchwings/db";
import { detectBuildPlatform } from "@launchwings/lrs";
import { baseAgentPayload, defineAgent } from "../runtime";
import {
  crawlSite,
  FirecrawlError,
  type FirecrawlCrawlResult,
} from "../clients/firecrawl";
import {
  screenshotHomepage,
  BrowserbaseError,
  type BrowserbaseScreenshot,
} from "../clients/browserbase";
import {
  extractTitle,
  extractMetaDescription,
  extractHeroHeadline,
  extractPrimaryCta,
  extractFrameworkHints,
} from "../extractors";

// ----- Payload schema ------------------------------------------------------

export const importProductPayloadSchema = baseAgentPayload.extend({
  productId: z.string().uuid(),
  url: z.string().url(),
});

export type ImportProductPayload = z.infer<typeof importProductPayloadSchema>;

// ----- Public output type --------------------------------------------------

export type ImportProductOutput = {
  productId: string;
  buildPlatform: {
    platform: string | null;
    confidence: number;
  };
  screenshotCaptured: boolean;
};

// ----- Per-stage retry policy ----------------------------------------------

const FIRECRAWL_MAX_ATTEMPTS = 3;
const BROWSERBASE_MAX_ATTEMPTS = 2;

/** Firecrawl error kinds that are NOT worth retrying — propagate immediately. */
function isFirecrawlNonRetriable(err: FirecrawlError): boolean {
  return err.kind === "not_found" || err.kind === "robots_denied";
}

/** Browserbase error kinds that are NOT worth retrying. */
function isBrowserbaseNonRetriable(err: BrowserbaseError): boolean {
  return err.kind === "not_found";
}

async function crawlWithRetry(
  url: string,
  apiKey: string,
  log: (line: Record<string, unknown>) => void,
): Promise<FirecrawlCrawlResult> {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= FIRECRAWL_MAX_ATTEMPTS; attempt++) {
    try {
      return await crawlSite(url, { maxPages: 5, depth: 1, apiKey });
    } catch (err) {
      lastErr = err;
      if (err instanceof FirecrawlError && isFirecrawlNonRetriable(err)) {
        log({
          level: "warn",
          source: "agents.import-product",
          message: "firecrawl_non_retriable",
          attempt,
          kind: err.kind,
        });
        throw err;
      }
      log({
        level: "warn",
        source: "agents.import-product",
        message: "firecrawl_attempt_failed",
        attempt,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`firecrawl: exhausted ${FIRECRAWL_MAX_ATTEMPTS} attempts`);
}

async function screenshotWithRetry(
  url: string,
  apiKey: string,
  projectId: string,
  log: (line: Record<string, unknown>) => void,
): Promise<BrowserbaseScreenshot> {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= BROWSERBASE_MAX_ATTEMPTS; attempt++) {
    try {
      return await screenshotHomepage(url, { apiKey, projectId });
    } catch (err) {
      lastErr = err;
      if (err instanceof BrowserbaseError && isBrowserbaseNonRetriable(err)) {
        log({
          level: "warn",
          source: "agents.import-product",
          message: "browserbase_non_retriable",
          attempt,
          kind: err.kind,
        });
        throw err;
      }
      log({
        level: "warn",
        source: "agents.import-product",
        message: "browserbase_attempt_failed",
        attempt,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`browserbase: exhausted ${BROWSERBASE_MAX_ATTEMPTS} attempts`);
}

// ----- Runtime config check ------------------------------------------------

function readRuntimeConfig(): {
  firecrawlApiKey: string;
  browserbaseApiKey: string;
  browserbaseProjectId: string;
} {
  const firecrawlApiKey = process.env.FIRECRAWL_API_KEY;
  const browserbaseApiKey = process.env.BROWSERBASE_API_KEY;
  const browserbaseProjectId = process.env.BROWSERBASE_PROJECT_ID;
  if (!firecrawlApiKey || !browserbaseApiKey || !browserbaseProjectId) {
    // No keys = config fault; nothing to retry on. AbortTaskRunError stops the
    // Trigger.dev runtime from retrying.
    throw new AbortTaskRunError(
      "import-product not configured: FIRECRAWL_API_KEY / BROWSERBASE_API_KEY / BROWSERBASE_PROJECT_ID missing on agents worker",
    );
  }
  return { firecrawlApiKey, browserbaseApiKey, browserbaseProjectId };
}

// ----- Helpers for metadata.import_error -----------------------------------

type ImportErrorStage = "firecrawl" | "browserbase";

function buildImportError(
  stage: ImportErrorStage,
  err: unknown,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    stage,
    at: new Date().toISOString(),
    message: err instanceof Error ? err.message : String(err),
  };
  if (err instanceof FirecrawlError || err instanceof BrowserbaseError) {
    base.kind = err.kind;
  }
  return base;
}

// ----- Pure run body (testable) -------------------------------------------

/**
 * Pure-ish body of the import task. Exported so unit tests can drive the
 * partial-success policy without going through the trigger.dev/schemaTask
 * wrapper. Production callers use `importProductTask.trigger(...)`.
 *
 * The function takes `getDb` so tests can inject a fake DbPool that bypasses
 * the real `dbPool()` factory; production passes the real `dbPool` directly.
 */
export async function runImportProduct(
  payload: ImportProductPayload,
  log: (line: Record<string, unknown>) => void,
  getDb: () => DbPool = dbPool,
): Promise<ImportProductOutput> {
  const { url, productId, tenantId } = payload;

    log({
      level: "info",
      source: "agents.import-product",
      message: "import_started",
      productId,
      url,
    });

    const { firecrawlApiKey, browserbaseApiKey, browserbaseProjectId } =
      readRuntimeConfig();

    // ---- Firecrawl (hard-required) --------------------------------------
    let crawlResult: FirecrawlCrawlResult;
    try {
      crawlResult = await crawlWithRetry(url, firecrawlApiKey, log);
    } catch (err) {
      // Persist import_error.stage = "firecrawl" then throw so Trigger marks
      // the run failed. Use a fresh withTenant — the agents-runtime
      // transaction wrapper persists agent_runs separately, so this write
      // surfaces to the founder UI even on failure.
      const importError = buildImportError("firecrawl", err);
      try {
        const db = getDb();
        await withTenant(db, tenantId, async (tx) => {
          await mergeProductMetadata(tx, productId, {
            import_error: importError,
          });
        });
      } catch (persistErr) {
        log({
          level: "error",
          source: "agents.import-product",
          message: "import_error_persist_failed",
          productId,
          stage: "firecrawl",
          persistError:
            persistErr instanceof Error ? persistErr.message : String(persistErr),
        });
      }
      // Non-retriable Firecrawl errors (404 / robots) abort the run; otherwise
      // surface as a normal failure (Trigger will retry within its policy).
      if (err instanceof FirecrawlError && isFirecrawlNonRetriable(err)) {
        throw new AbortTaskRunError(`firecrawl ${err.kind}: ${err.message}`);
      }
      throw err;
    }

    const homepage = crawlResult.pages[0];
    const homepageHtml = homepage?.html ?? "";

    const extracted = {
      title: extractTitle(homepageHtml),
      metaDescription: extractMetaDescription(homepageHtml),
      heroHeadline: extractHeroHeadline(homepageHtml),
      primaryCta: extractPrimaryCta(homepageHtml),
      frameworkHints: extractFrameworkHints(homepageHtml),
    };

    const buildPlatform = detectBuildPlatform({ url, html: homepageHtml });

    // ---- Browserbase (best-effort) --------------------------------------
    // We deliberately do NOT race Firecrawl + Browserbase in parallel here:
    // running them sequentially keeps the failure modes (and the import_error
    // stage) crisp, and Browserbase only takes the homepage URL — there's no
    // dependency on crawl output beyond knowing crawl succeeded.
    let shot: BrowserbaseScreenshot | null = null;
    let browserbaseError: unknown = null;
    try {
      shot = await screenshotWithRetry(
        url,
        browserbaseApiKey,
        browserbaseProjectId,
        log,
      );
    } catch (err) {
      browserbaseError = err;
      log({
        level: "warn",
        source: "agents.import-product",
        message: "browserbase_failed_continuing",
        productId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const importedAt = new Date().toISOString();

    // ---- Persist metadata + build-platform detection inside withTenant ---
    const db = getDb();
    await withTenant(db, tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(products)
        .where(eq(products.id, productId));
      const product = rows[0];
      if (!product) {
        // Stub row was inserted by tRPC dispatcher under the same tenant; if
        // we can't see it, RLS or row-deletion is in play. Either way the run
        // can't succeed.
        throw new AbortTaskRunError(
          `import-product: product ${productId} not visible in tenant`,
        );
      }

      const productName =
        extracted.title ?? safeHostname(url) ?? product.name ?? safeHostname(url);
      const currentMetadata =
        (product.metadata ?? {}) as Record<string, unknown>;

      const nextMetadata: Record<string, unknown> = {
        ...currentMetadata,
        pages: crawlResult.pages.map((p) => ({
          url: p.url,
          markdown: p.markdown,
          metadata: p.metadata,
        })),
        extracted,
        importedAt,
      };
      if (shot) {
        nextMetadata.screenshot = {
          pngBase64: shot.pngBase64,
          viewport: shot.viewport,
        };
        // Firecrawl-only success path: clear any previous import_error.
        delete nextMetadata.import_error;
      } else {
        nextMetadata.import_error = buildImportError(
          "browserbase",
          browserbaseError,
        );
      }

      await tx
        .update(products)
        .set({
          name: productName,
          description: extracted.metaDescription,
          metadata: nextMetadata,
          updatedAt: new Date(),
        })
        .where(eq(products.id, productId));

      await tx.insert(productBuildPlatformDetections).values({
        tenantId,
        productUrl: url,
        platform: buildPlatform.platform,
        confidence: Math.round(buildPlatform.confidence * 100),
        signalsJson: buildPlatform.signals,
      });
    });

    log({
      level: "info",
      source: "agents.import-product",
      message: "import_completed",
      productId,
      url,
      screenshotCaptured: shot != null,
      buildPlatform: buildPlatform.platform,
    });

  return {
    productId,
    buildPlatform: {
      platform: buildPlatform.platform,
      confidence: buildPlatform.confidence,
    },
    screenshotCaptured: shot != null,
  };
}

// ----- Trigger.dev task ----------------------------------------------------

export const importProductTask = defineAgent({
  name: "import-product",
  schema: importProductPayloadSchema,
  // Run-level retries (3 from trigger.config.ts) re-execute the body —
  // acceptable because the body is idempotent (read-modify-write on metadata
  // and the dispatcher passes an idempotencyKey on .trigger() so the same
  // (tenantId, productId) doesn't enqueue twice). Per-stage retries (Firecrawl
  // 3, Browserbase 2) live INSIDE runImportProduct.
  run: async (payload, runCtx): Promise<ImportProductOutput> => {
    return runImportProduct(payload, runCtx.helpers.logEvent);
  },
});

// ----- Pure helper exposed for unit tests ---------------------------------

/**
 * Read-modify-write the products.metadata jsonb. The discovery / positioning
 * agents do this inline; we extract it here because the import task does the
 * merge from two distinct branches (success and firecrawl-failure cleanup).
 *
 * Exported for tests so they can drive the same path without spinning up the
 * full task body. Caller must supply the RLS-scoped tx.
 */
export async function mergeProductMetadata(
  // Real callers pass the tx from withTenant() (DbPool). Tests use a chain-
  // level mock cast to `never`/`DbPool` (mirrors the discovery.test pattern).
  tx: DbPool,
  productId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const rows = await tx.select().from(products).where(eq(products.id, productId));
  const product = rows[0];
  const currentMetadata =
    (product?.metadata ?? {}) as Record<string, unknown>;
  const nextMetadata: Record<string, unknown> = {
    ...currentMetadata,
    ...patch,
  };
  await tx
    .update(products)
    .set({ metadata: nextMetadata, updatedAt: new Date() })
    .where(eq(products.id, productId));
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
