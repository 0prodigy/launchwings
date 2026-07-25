// ONB-01 — Browserbase client for the URL-importer homepage screenshot.
//
// Browserbase does NOT expose a "POST /v1/sessions/:id/screenshot" REST
// endpoint (the prior implementation hit a 404 in production). The
// supported path is: create a session via the SDK, attach Playwright over
// CDP, navigate, then call the CDP `Page.captureScreenshot` method.
// Docs: https://docs.browserbase.com/features/screenshots
//
// We keep the existing `pngBase64` field on the public return type to
// minimize blast radius on callers (tRPC products router stores it inside
// products.metadata.screenshot). PNG also lets us drop the JPEG-only
// `quality` param — switch to JPEG + rename later if payload size bites.
//
// Browserbase bills by session-minute; the importer is one-shot, so the
// `finally` block always closes the browser to release the session.

import Browserbase from "@browserbasehq/sdk";
import { chromium, type Browser } from "playwright-core";

const TIMEOUT_MS = 20_000;
const DEFAULT_VIEWPORT = { width: 1280, height: 800 } as const;

export type BrowserbaseScreenshot = {
  pngBase64: string;
  viewport: { width: number; height: number };
};

export type BrowserbaseErrorKind = "timeout" | "not_found" | "rate_limited" | "unknown";

export class BrowserbaseError extends Error {
  readonly kind: BrowserbaseErrorKind;
  readonly status: number | null;
  constructor(kind: BrowserbaseErrorKind, message: string, status: number | null = null) {
    super(message);
    this.name = "BrowserbaseError";
    this.kind = kind;
    this.status = status;
  }
}

function classifyError(err: unknown): BrowserbaseError {
  if (err instanceof BrowserbaseError) return err;
  const e = err as { name?: string; status?: number; message?: string } | undefined;
  const msg = e?.message ?? String(err);
  if (e?.name === "AbortError" || /timeout|timed out/i.test(msg)) {
    return new BrowserbaseError("timeout", `browserbase request exceeded ${TIMEOUT_MS}ms`);
  }
  const status = typeof e?.status === "number" ? e.status : null;
  if (status === 404 || /ERR_NAME_NOT_RESOLVED|net::ERR_/i.test(msg)) {
    return new BrowserbaseError("not_found", `browserbase not_found: ${msg}`, status);
  }
  if (status === 429 || /rate.?limit/i.test(msg)) {
    return new BrowserbaseError("rate_limited", `browserbase rate_limited: ${msg}`, status);
  }
  return new BrowserbaseError("unknown", `browserbase error: ${msg}`, status);
}

export async function screenshotHomepage(
  url: string,
  opts: { apiKey: string; projectId: string },
): Promise<BrowserbaseScreenshot> {
  const bb = new Browserbase({ apiKey: opts.apiKey });
  const ref: { browser: Browser | null } = { browser: null };

  const work = (async (): Promise<BrowserbaseScreenshot> => {
    const session = await bb.sessions.create({ projectId: opts.projectId });
    const browser = await chromium.connectOverCDP(session.connectUrl);
    ref.browser = browser;
    const ctx = browser.contexts()[0] ?? (await browser.newContext());
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.setViewportSize({ width: DEFAULT_VIEWPORT.width, height: DEFAULT_VIEWPORT.height });
    await page.goto(url, { waitUntil: "load" });

    const cdp = await ctx.newCDPSession(page);
    const result = (await cdp.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
    })) as { data: string };
    if (!result?.data) {
      throw new BrowserbaseError("unknown", "browserbase captureScreenshot returned no data");
    }
    return { pngBase64: result.data, viewport: { ...DEFAULT_VIEWPORT } };
  })();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new BrowserbaseError("timeout", `browserbase request exceeded ${TIMEOUT_MS}ms`)),
      TIMEOUT_MS,
    );
  });

  try {
    return await Promise.race([work, timeout]);
  } catch (err) {
    throw classifyError(err);
  } finally {
    if (timer) clearTimeout(timer);
    if (ref.browser) {
      try {
        await ref.browser.close();
      } catch {
        // swallow — server-side session times out anyway, but we tried.
      }
    }
  }
}
