// ONB-01 — thin Firecrawl v1 REST client used by the URL importer.
//
// Two-step flow:
//   1) POST /v1/scrape with the homepage URL — synchronous, returns html +
//      markdown + metadata for the single page.
//   2) POST /v1/crawl with the same URL + maxPages/maxDepth — asynchronous;
//      returns a job id we then poll on /v1/crawl/{id} until status === "completed"
//      (or we hit the 30s budget). Their typical depth-1 job is 5–8s.
//
// Error mapping is the contract the tRPC router relies on; keep the `kind`
// vocabulary stable.

const FIRECRAWL_BASE = "https://api.firecrawl.dev";
const POLL_BUDGET_MS = 30_000;
const POLL_INTERVAL_MS = 1_000;
// Hard ceiling on the synchronous /v1/scrape call. Firecrawl's docs target
// 5–8s for a single page; production has shown rare hangs that exceed Vercel's
// 60s function ceiling. Bound the request explicitly so the importer task can
// retry instead of blocking the worker indefinitely.
const SCRAPE_TIMEOUT_MS = 25_000;

export type FirecrawlPage = {
  url: string;
  html: string;
  markdown: string;
  metadata: Record<string, unknown>;
};

export type FirecrawlCrawlResult = {
  pages: FirecrawlPage[];
};

export type FirecrawlErrorKind =
  | "not_found"
  | "robots_denied"
  | "timeout"
  | "rate_limited"
  | "unknown";

export class FirecrawlError extends Error {
  readonly kind: FirecrawlErrorKind;
  readonly status: number | null;
  constructor(kind: FirecrawlErrorKind, message: string, status: number | null = null) {
    super(message);
    this.name = "FirecrawlError";
    this.kind = kind;
    this.status = status;
  }
}

type ScrapeFormat = "html" | "markdown";

type ScrapeResponse = {
  success?: boolean;
  data?: {
    html?: string;
    markdown?: string;
    metadata?: Record<string, unknown> & { sourceURL?: string; url?: string };
  };
  error?: string;
};

type CrawlStartResponse = {
  success?: boolean;
  id?: string;
  error?: string;
};

type CrawlStatusResponse = {
  status?: "scraping" | "completed" | "failed" | string;
  data?: Array<{
    html?: string;
    markdown?: string;
    metadata?: Record<string, unknown> & { sourceURL?: string; url?: string };
  }>;
  error?: string;
};

function classifyHttp(status: number, body: string): FirecrawlErrorKind {
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  // Firecrawl returns 403 with a body mentioning robots.txt for denied crawls.
  if (status === 403 && /robots/i.test(body)) return "robots_denied";
  return "unknown";
}

async function postJson<T>(
  path: string,
  body: unknown,
  apiKey: string,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(`${FIRECRAWL_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new FirecrawlError(classifyHttp(res.status, text), `firecrawl ${path} ${res.status}: ${text.slice(0, 500)}`, res.status);
  }
  return (await res.json()) as T;
}

async function getJson<T>(path: string, apiKey: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${FIRECRAWL_BASE}${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new FirecrawlError(classifyHttp(res.status, text), `firecrawl ${path} ${res.status}: ${text.slice(0, 500)}`, res.status);
  }
  return (await res.json()) as T;
}

function pageFromScrape(url: string, body: ScrapeResponse): FirecrawlPage {
  const data = body.data ?? {};
  const meta = data.metadata ?? {};
  return {
    url: (meta.sourceURL as string | undefined) ?? (meta.url as string | undefined) ?? url,
    html: data.html ?? "",
    markdown: data.markdown ?? "",
    metadata: meta,
  };
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    if (signal) {
      const onAbort = () => {
        clearTimeout(t);
        reject(new FirecrawlError("timeout", "firecrawl poll aborted"));
      };
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

export async function crawlSite(
  url: string,
  opts: { maxPages?: number; depth?: number; apiKey: string },
): Promise<FirecrawlCrawlResult> {
  const maxPages = Math.min(opts.maxPages ?? 5, 5);
  const depth = Math.min(opts.depth ?? 1, 1);
  const apiKey = opts.apiKey;

  const formats: ScrapeFormat[] = ["html", "markdown"];

  // 1) Scrape the homepage synchronously so the importer always gets the
  //    primary page even if /crawl times out below. The fetch is bounded by
  //    SCRAPE_TIMEOUT_MS because Firecrawl has been observed to hang past the
  //    ambient Vercel 60s ceiling; surfacing a typed `timeout` lets the caller
  //    (Trigger.dev importProductTask) retry on its own schedule.
  const scrapeAc = new AbortController();
  const scrapeStartedAt = Date.now();
  const scrapeTimer = setTimeout(() => scrapeAc.abort(), SCRAPE_TIMEOUT_MS);
  let scrape: ScrapeResponse;
  try {
    scrape = await postJson<ScrapeResponse>(
      "/v1/scrape",
      { url, formats },
      apiKey,
      scrapeAc.signal,
    );
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError" || scrapeAc.signal.aborted) {
      throw new FirecrawlError(
        "timeout",
        `firecrawl /v1/scrape exceeded ${SCRAPE_TIMEOUT_MS}ms (elapsed_ms=${Date.now() - scrapeStartedAt})`,
      );
    }
    throw err;
  } finally {
    clearTimeout(scrapeTimer);
  }
  const homepage = pageFromScrape(url, scrape);
  const pages: FirecrawlPage[] = [homepage];

  // 2) Kick off a depth-1 crawl for follow-up pages. Cap pages and budget;
  //    if the crawl times out we still return the homepage.
  const startedAt = Date.now();
  const ac = new AbortController();
  const overallTimer = setTimeout(() => ac.abort(), POLL_BUDGET_MS);
  try {
    const start = await postJson<CrawlStartResponse>(
      "/v1/crawl",
      {
        url,
        limit: maxPages,
        maxDepth: depth,
        scrapeOptions: { formats },
      },
      apiKey,
      ac.signal,
    );
    const jobId = start.id;
    if (!jobId) {
      // No id back — treat as soft failure, return what we have.
      return { pages };
    }

    while (Date.now() - startedAt < POLL_BUDGET_MS) {
      const status = await getJson<CrawlStatusResponse>(`/v1/crawl/${jobId}`, apiKey, ac.signal);
      if (status.status === "failed") {
        throw new FirecrawlError("unknown", `firecrawl crawl failed: ${status.error ?? "no detail"}`);
      }
      if (status.status === "completed") {
        for (const item of status.data ?? []) {
          const meta = item.metadata ?? {};
          const itemUrl =
            (meta.sourceURL as string | undefined) ?? (meta.url as string | undefined) ?? "";
          if (!itemUrl || itemUrl === homepage.url) continue;
          pages.push({
            url: itemUrl,
            html: item.html ?? "",
            markdown: item.markdown ?? "",
            metadata: meta,
          });
          if (pages.length >= maxPages) break;
        }
        return { pages };
      }
      await sleep(POLL_INTERVAL_MS, ac.signal);
    }
    // Budget exhausted — return homepage-only result rather than failing the
    // whole import. The router still got the title/description/CTA fields.
    return { pages };
  } catch (err) {
    if (err instanceof FirecrawlError) {
      // Crawl-step failures shouldn't lose the homepage we already have when
      // they're "soft" (timeout). For not_found/robots/rate_limited we surface
      // the typed error so the router maps to the right tRPC code.
      if (err.kind === "timeout") return { pages };
      throw err;
    }
    if ((err as { name?: string })?.name === "AbortError") {
      return { pages };
    }
    throw new FirecrawlError("unknown", `firecrawl crawl error: ${(err as Error).message}`);
  } finally {
    clearTimeout(overallTimer);
  }
}
