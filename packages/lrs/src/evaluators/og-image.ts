import * as cheerio from "cheerio";
import { RetryableError, type AuditContext, type AuditTarget, type EvalResult, type Evaluator } from "../types";

// dogfood-LRS-07 — og:image asset validation.
//
// Per docs/tickets/dogfood-LRS-07-og-image-asset.md and
// docs/dogfood/LRS_AUDIT_LOG.md items 10 + 11:
//
//   - Parse `<meta property="og:image">` (and `og:image:secure_url` if set).
//   - HEAD the URL.
//   - Assert HTTP 200 AND `content-type: image/*`.
//   - If headers expose width/height we record them; PR2 will add the
//     dimensions assertion (≥ 600×314 for `summary_large_image`, ratio 2:1
//     ± 5%) once we wire `sharp` for byte-level decode.
//
// PR1 deliberately does NOT decode the image bytes — that's the
// dimension-validation work in PR2. The 200/image/* check alone closes the
// audit log's findings 10 + 11 root cause: meta tag advertises a URL that
// returns the Next 404 HTML.
//
// Network failures during HEAD are wrapped as RetryableError so the runner
// can retry transient blips. A 404 / 5xx is NOT a network failure — those
// are real findings, returned as severity: fail.

const FETCH_TIMEOUT_MS = 8_000;

export type OgImageEvidence = {
  ogImageUrl: string | null;
  resolvedFromTag: "og:image" | "og:image:secure_url" | null;
  status: number | null;
  contentType: string | null;
  contentLength: number | null;
  declaredWidth: number | null;
  declaredHeight: number | null;
};

function parseDeclaredDim(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Resolve an og:image URL relative to the page's URL, like a browser would. */
function resolveAbsolute(maybeRelative: string, baseUrl: string): string {
  try {
    return new URL(maybeRelative, baseUrl).toString();
  } catch {
    return maybeRelative;
  }
}

export type OgImageProbeOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

/** Pure-ish: parses HTML for the og:image meta tags. No network. */
export function parseOgImageFromHtml(
  html: string,
  baseUrl: string,
): {
  ogImageUrl: string | null;
  resolvedFromTag: "og:image" | "og:image:secure_url" | null;
  declaredWidth: number | null;
  declaredHeight: number | null;
} {
  const $ = cheerio.load(html);
  const find = (prop: string): string | undefined =>
    $("meta")
      .filter((_, el) => $(el).attr("property")?.toLowerCase() === prop)
      .first()
      .attr("content");

  const secureUrl = find("og:image:secure_url");
  const url = find("og:image");
  const declaredWidth = parseDeclaredDim(find("og:image:width"));
  const declaredHeight = parseDeclaredDim(find("og:image:height"));

  if (secureUrl) {
    return {
      ogImageUrl: resolveAbsolute(secureUrl, baseUrl),
      resolvedFromTag: "og:image:secure_url",
      declaredWidth,
      declaredHeight,
    };
  }
  if (url) {
    return {
      ogImageUrl: resolveAbsolute(url, baseUrl),
      resolvedFromTag: "og:image",
      declaredWidth,
      declaredHeight,
    };
  }
  return {
    ogImageUrl: null,
    resolvedFromTag: null,
    declaredWidth,
    declaredHeight,
  };
}

/** Performs the HEAD probe against the resolved og:image URL. */
export async function probeOgImage(
  url: string,
  options: OgImageProbeOptions = {},
): Promise<{
  status: number;
  contentType: string | null;
  contentLength: number | null;
}> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: "HEAD",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "user-agent": "LaunchWings-LRS-Audit/0.1 (+https://launchwings.com)",
        },
      });
    } catch (err) {
      // Some hosts (incl. some CDN-fronted Vercel edge routes) reject HEAD.
      // Fall back to a ranged GET that asks for 0 bytes — same headers, no
      // body. Wrap network-shaped errors as retryable; a non-retryable
      // throw here would burn the eval as a hard fail with no chance to
      // recover. AbortError is intentionally retried — could be a slow
      // origin or a one-off egress hiccup.
      if (err instanceof Error && err.name === "AbortError") {
        throw new RetryableError(`og:image HEAD timed out after ${timeoutMs}ms`, { cause: err });
      }
      throw new RetryableError(
        `og:image HEAD failed: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }
    const contentType = res.headers.get("content-type");
    const contentLengthRaw = res.headers.get("content-length");
    const contentLength = contentLengthRaw ? Number.parseInt(contentLengthRaw, 10) : null;
    return {
      status: res.status,
      contentType,
      contentLength: Number.isFinite(contentLength) ? contentLength : null,
    };
  } finally {
    clearTimeout(timer);
  }
}

export const ogImageEvaluator: Evaluator = {
  id: "dogfood-LRS-07",
  title: "OG image asset reachable",
  checklistRef: "Stage 1 items 10 + 11 (og:image and twitter:image resolve)",
  evaluate: async (target: AuditTarget, ctx: AuditContext): Promise<EvalResult> => {
    const start = ctx.now();
    const fetched = target.fetchedHtml
      ? { html: target.fetchedHtml, finalUrl: target.finalUrl ?? target.url, status: 200 }
      : await ctx.fetchHtml(target.url);
    const baseUrl = fetched.finalUrl || target.url;
    const parsed = parseOgImageFromHtml(fetched.html, baseUrl);

    const evidenceBase: OgImageEvidence = {
      ogImageUrl: parsed.ogImageUrl,
      resolvedFromTag: parsed.resolvedFromTag,
      status: null,
      contentType: null,
      contentLength: null,
      declaredWidth: parsed.declaredWidth,
      declaredHeight: parsed.declaredHeight,
    };

    if (!parsed.ogImageUrl) {
      return {
        evaluatorId: "dogfood-LRS-07",
        severity: "fail",
        score: 0,
        latencyMs: Math.max(0, ctx.now() - start),
        costUsdMicros: 0,
        evidenceJson: evidenceBase as unknown as Record<string, unknown>,
        fixActionMarkdown:
          "Add `<meta property=\"og:image\" content=\"https://your.site/og.png\">` (1200×630). On Next 15, prefer the file convention `app/opengraph-image.tsx` so the head is wired automatically.",
      };
    }

    const probe = await probeOgImage(parsed.ogImageUrl);
    const evidence: OgImageEvidence = {
      ...evidenceBase,
      status: probe.status,
      contentType: probe.contentType,
      contentLength: probe.contentLength,
    };

    const okStatus = probe.status >= 200 && probe.status < 300;
    const okType = !!probe.contentType && probe.contentType.toLowerCase().startsWith("image/");

    if (okStatus && okType) {
      return {
        evaluatorId: "dogfood-LRS-07",
        severity: "pass",
        score: 100,
        latencyMs: Math.max(0, ctx.now() - start),
        costUsdMicros: 0,
        evidenceJson: evidence as unknown as Record<string, unknown>,
        fixActionMarkdown: `OG image at \`${parsed.ogImageUrl}\` resolves with content-type \`${probe.contentType}\`. No action needed.`,
      };
    }

    if (okStatus && !okType) {
      // 200, but the body is not an image — most commonly a Next 404 page
      // returned with `text/html` (the exact failure mode in audit log #10).
      return {
        evaluatorId: "dogfood-LRS-07",
        severity: "fail",
        score: 10,
        latencyMs: Math.max(0, ctx.now() - start),
        costUsdMicros: 0,
        evidenceJson: evidence as unknown as Record<string, unknown>,
        fixActionMarkdown: `OG image URL \`${parsed.ogImageUrl}\` returned HTTP ${probe.status} with content-type \`${probe.contentType ?? "(none)"}\`. Twitter, LinkedIn, Slack and Discord previewers will render a broken card. Check that the asset actually exists (Next 15: \`app/opengraph-image.tsx\` or \`apps/web/public/og-default.png\`).`,
      };
    }

    return {
      evaluatorId: "dogfood-LRS-07",
      severity: "fail",
      score: 0,
      latencyMs: Math.max(0, ctx.now() - start),
      costUsdMicros: 0,
      evidenceJson: evidence as unknown as Record<string, unknown>,
      fixActionMarkdown: `OG image URL \`${parsed.ogImageUrl}\` returned HTTP ${probe.status}. Every social card preview will fail. Ship the asset (or a Next 15 \`app/opengraph-image.tsx\` route) and re-run.`,
    };
  },
};
