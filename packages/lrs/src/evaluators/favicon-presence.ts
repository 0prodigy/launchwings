import * as cheerio from "cheerio";
import {
  RetryableError,
  type AuditContext,
  type AuditTarget,
  type EvalResult,
  type Evaluator,
} from "../types";

// dogfood-LRS-06 (evaluator portion) — favicon / icon-asset presence.
//
// Per docs/tickets/dogfood-LRS-06-favicon-and-logo.md the ticket is split
// into two halves: founder-ops shipping the actual favicon + logo files
// (out of scope for this PR per the brief), and a harness-side evaluator
// that confirms the icons are reachable.
//
// What this evaluator does:
//   1. Fetch the page HTML (memoised via ctx.fetchHtml).
//   2. Probe a fixed list of "should always exist" icon URLs at the
//      origin: /favicon.ico, /icon.png, /apple-touch-icon.png. These
//      are the conventional names Next 15, Vite, Astro, and most static
//      hosts auto-pick up.
//   3. ALSO probe any <link rel*="icon"> / rel*="apple-touch-icon" href
//      explicitly declared in the HTML. (A site with a non-default name
//      like /assets/favicon-v2.png would fail otherwise.)
//   4. Each URL is fetched HEAD; status 200 + content-type starting
//      `image/` counts as "present."
//
// Severity ladder per the ticket:
//   pass    /favicon.ico AND one of (/icon.png, /apple-touch-icon.png)
//           resolve. Modern browsers (favicon.ico) AND iOS home-screen
//           (apple-touch-icon) both work.
//   warn    Only one of the two resolves. Site has a tab icon but no
//           pinned/home-screen icon (or vice versa).
//   fail    None resolve. Tab icon will be a generic globe, home-screen
//           pin will be a screenshot.
//
// We deliberately do NOT decode the bytes for dimensions in PR2 — that
// is the `sharp` work the ticket calls out and lands when we wire OG
// dimension validation in PR3. The 200 / image/* check alone catches
// the audit-log #12 root cause: favicon advertised by Next 15 default
// but `apps/web/public/` doesn't exist.
//
// HEAD failures are wrapped as RetryableError (transient) — same shape
// as og-image's probe. A 404 is a finding, not an infrastructure blip,
// so we record it on the evidence array and move on.

const FETCH_TIMEOUT_MS = 8_000;

const DEFAULT_PROBES = [
  "/favicon.ico",
  "/icon.png",
  "/apple-touch-icon.png",
] as const;

export type FaviconProbeResult = {
  url: string;
  status: number | null;
  contentType: string | null;
  /** true when status==200 and content-type starts with image/. */
  present: boolean;
  /** Source of this probe URL: convention-based default or explicit HTML <link>. */
  source: "convention" | "html-link";
  /** rel attribute value if discovered from a <link> tag. */
  rel?: string;
  /** sizes attribute if present (dimension hint). */
  sizes?: string;
  /** Captured network-error message if the HEAD failed before a status was returned. */
  error?: string;
};

export type FaviconEvidence = {
  origin: string;
  probes: FaviconProbeResult[];
  hasFavicon: boolean;
  hasAppleTouch: boolean;
  hasIconPng: boolean;
};

export type FaviconLinkRef = {
  url: string;
  rel: string;
  sizes?: string;
};

export type FaviconProbeOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

/** Pure: parse the HTML for any explicit <link rel*="icon"> references. */
export function parseFaviconLinks(html: string, baseUrl: string): FaviconLinkRef[] {
  const $ = cheerio.load(html);
  const out: FaviconLinkRef[] = [];
  $("link").each((_, el) => {
    const rel = $(el).attr("rel");
    const href = $(el).attr("href");
    if (typeof rel !== "string" || typeof href !== "string") return;
    const relLower = rel.toLowerCase();
    // rel can be space-separated ("icon shortcut"). Match if any token
    // contains "icon" — covers `icon`, `shortcut icon`, `apple-touch-icon`,
    // `apple-touch-icon-precomposed`, `mask-icon`, etc.
    const isIconRel = relLower
      .split(/\s+/)
      .some((tok) => tok === "icon" || tok.endsWith("-icon") || tok.includes("apple-touch"));
    if (!isIconRel) return;
    let absolute: string;
    try {
      absolute = new URL(href, baseUrl).toString();
    } catch {
      return;
    }
    out.push({
      url: absolute,
      rel: relLower,
      sizes: $(el).attr("sizes")?.trim() || undefined,
    });
  });
  return out;
}

/** HEAD a single URL; returns a structured probe result, never throws for 4xx/5xx. */
export async function probeIcon(
  url: string,
  options: FaviconProbeOptions = {},
): Promise<{ status: number; contentType: string | null }> {
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
      if (err instanceof Error && err.name === "AbortError") {
        throw new RetryableError(`favicon HEAD timed out after ${timeoutMs}ms`, { cause: err });
      }
      throw new RetryableError(
        `favicon HEAD failed: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }
    return {
      status: res.status,
      contentType: res.headers.get("content-type"),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Compose an absolute URL from an origin and a path. */
function originFor(targetUrl: string): string {
  try {
    const u = new URL(targetUrl);
    return `${u.protocol}//${u.host}`;
  } catch {
    return targetUrl;
  }
}

function isImagePresent(probe: { status: number | null; contentType: string | null }): boolean {
  return (
    probe.status !== null &&
    probe.status >= 200 &&
    probe.status < 300 &&
    !!probe.contentType &&
    probe.contentType.toLowerCase().startsWith("image/")
  );
}

export const faviconEvaluator: Evaluator = {
  id: "dogfood-LRS-06",
  title: "Favicon / icon-asset presence",
  checklistRef: "Stage 1 item 9 (favicon + apple-touch-icon)",
  evaluate: async (target: AuditTarget, ctx: AuditContext): Promise<EvalResult> => {
    const start = ctx.now();
    const fetched = target.fetchedHtml
      ? { html: target.fetchedHtml, finalUrl: target.finalUrl ?? target.url, status: 200 }
      : await ctx.fetchHtml(target.url);
    const baseUrl = fetched.finalUrl || target.url;
    const origin = originFor(baseUrl);

    // Build the probe set: convention defaults + any explicit <link rel*=icon>.
    const conventionProbes: FaviconProbeResult[] = DEFAULT_PROBES.map((path) => ({
      url: `${origin}${path}`,
      status: null,
      contentType: null,
      present: false,
      source: "convention" as const,
    }));
    const linkProbes: FaviconProbeResult[] = parseFaviconLinks(fetched.html, baseUrl).map((link) => ({
      url: link.url,
      status: null,
      contentType: null,
      present: false,
      source: "html-link" as const,
      rel: link.rel,
      sizes: link.sizes,
    }));

    // De-duplicate by URL — convention path may equal an explicit <link>.
    const byUrl = new Map<string, FaviconProbeResult>();
    for (const p of [...conventionProbes, ...linkProbes]) {
      const existing = byUrl.get(p.url);
      if (!existing) {
        byUrl.set(p.url, p);
      } else {
        // If the same URL appears as both convention + link, prefer the
        // link-source record (it carries rel + sizes hints).
        if (p.source === "html-link") byUrl.set(p.url, p);
      }
    }
    const probes = Array.from(byUrl.values());

    // Run all probes in parallel. Each one's failure is captured on the
    // probe record; we don't fail the whole evaluator on a transient.
    await Promise.all(
      probes.map(async (probe) => {
        try {
          const out = await probeIcon(probe.url);
          probe.status = out.status;
          probe.contentType = out.contentType;
          probe.present = isImagePresent(out);
        } catch (err) {
          // RetryableError from probeIcon — capture, don't escalate. The
          // runner does its own retry on RetryableError thrown out of
          // evaluate(); we want partial visibility.
          probe.status = null;
          probe.contentType = null;
          probe.present = false;
          probe.error = err instanceof Error ? err.message : String(err);
        }
      }),
    );

    const find = (path: string) =>
      probes.find((p) => p.url === `${origin}${path}` && p.source === "convention");
    const faviconProbe = find("/favicon.ico");
    const iconPngProbe = find("/icon.png");
    const appleTouchProbe = find("/apple-touch-icon.png");

    const hasFavicon =
      !!faviconProbe?.present ||
      probes.some(
        (p) => p.source === "html-link" && p.present && (p.rel === "icon" || p.rel?.includes("shortcut")),
      );
    const hasIconPng = !!iconPngProbe?.present;
    const hasAppleTouch =
      !!appleTouchProbe?.present ||
      probes.some(
        (p) => p.source === "html-link" && p.present && p.rel?.includes("apple-touch"),
      );

    const evidence: FaviconEvidence = {
      origin,
      probes,
      hasFavicon,
      hasAppleTouch,
      hasIconPng,
    };

    const hasAlternate = hasIconPng || hasAppleTouch;
    let severity: EvalResult["severity"];
    let score: number;
    let fixActionMarkdown: string;

    const fixLink =
      "See [`dogfood-LRS-06`](docs/tickets/dogfood-LRS-06-favicon-and-logo.md) for the brand-asset shipping checklist (favicon.ico, icon.png 512×512, apple-touch-icon.png 180×180).";

    if (hasFavicon && hasAlternate) {
      severity = "pass";
      score = 100;
      fixActionMarkdown = `Favicon + icon assets are present. ${fixLink}`;
    } else if (hasFavicon || hasAlternate) {
      severity = "warn";
      score = 70;
      fixActionMarkdown = `Only one of the icon assets resolves. ${
        hasFavicon
          ? "You have `/favicon.ico` but no `icon.png` or `apple-touch-icon.png` — iOS home-screen pins will fall back to a screenshot."
          : "You have an `icon.png` / `apple-touch-icon.png` but no `/favicon.ico` — older browsers and many feed readers will show a generic icon in the tab."
      } ${fixLink}`;
    } else {
      severity = "fail";
      score = 0;
      fixActionMarkdown = `No favicon or icon assets resolve at the conventional paths or via \`<link rel="icon">\`. Browser tabs will show a generic globe; home-screen pins will show a screenshot. ${fixLink}`;
    }

    return {
      evaluatorId: "dogfood-LRS-06",
      severity,
      score,
      latencyMs: Math.max(0, ctx.now() - start),
      costUsdMicros: 0,
      evidenceJson: evidence as unknown as Record<string, unknown>,
      fixActionMarkdown,
    };
  },
};
