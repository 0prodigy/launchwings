import * as cheerio from "cheerio";
import {
  RetryableError,
  type AuditContext,
  type AuditTarget,
  type EvalResult,
  type Evaluator,
} from "../types";

// dogfood-LRS-11 (static-analysis variant) — analytics-beacon evaluator.
//
// Per docs/tickets/dogfood-LRS-11-analytics-beacon.md the full ticket
// scope is "drive a headed browser, register Network.requestWillBeSent,
// confirm a beacon actually fires post-load." That live-beacon variant
// is blocked on Browserbase being wired (SETUP-11) and lands later as a
// separate evaluator (`analytics-beacon-live`).
//
// What this evaluator (PR5) ships is the spec's explicit fallback:
//
//   "Static-analysis fallback (no headed browser): regex shipped JS
//    chunks for known SDK init signatures (`posthog.init(`, `plausible(`,
//    `gtag('config'`); pass = present, but always weaker than a live
//    beacon."
//
// Algorithm:
//   1. Cheerio-extract every <script src="..."> URL from the shipped HTML.
//   2. Filter to URLs that resolve to the same origin OR a known
//      analytics-CDN host (PostHog, Plausible, GA, GTM, Fathom, Splitbee,
//      Simple Analytics). External-CDN scripts are worth fetching since
//      the SDK signature appears in them as well as in self-hosted bundles.
//   3. GET each script body with a per-request 10s timeout + 5MB body cap.
//      Aggregate into a single body string capped at 10MB total to bound
//      runtime on script-heavy SPAs.
//   4. Regex-scan the body for SDK init signatures (one or more patterns
//      per provider; first match wins for that provider).
//   5. Verdict ladder:
//        pass — at least one analytics SDK signature present.
//        warn — signature present but obvious placeholder strings
//               (`phc_REPLACE_ME`, `YOUR_GA_ID`, `123-456`) suggest the
//               SDK is shipped but misconfigured (same shape as the
//               PostHog `NEXT_PUBLIC_POSTHOG_KEY` silent-noop bug — see
//               docs/dogfood/learnings.md #10).
//        warn — a script src exists for a recognised provider but every
//               GET 5xx-d / threw — conservative "could not verify, but
//               assume present rather than punishing the founder for a
//               transient CDN blip."
//        fail — no analytics SDK detected at all.
//   6. Skip-with-warn when the HTML has zero <script> tags (degenerate
//      case: site is a static placeholder; treat as warn so the founder
//      sees the row but it doesn't show as a hard fail on what is
//      almost certainly a not-yet-shipped marketing page).
//
// Heuristics for self-hosted PostHog/Plausible (where the script src
// host is the customer's own origin) hit the same SDK-signature regexes
// because the JS body is identical — no separate code path needed.
//
// Network failures (timeout, abort, network reset) on a script GET are
// captured per-script in evidence; they don't escalate as RetryableError
// because we want to preserve partial visibility (some scripts probed,
// some failed). The runner already retries the HTML fetch upstream.

const FETCH_TIMEOUT_MS = 10_000;
const PER_SCRIPT_BODY_CAP_BYTES = 5 * 1024 * 1024;
const AGGREGATE_BODY_CAP_BYTES = 10 * 1024 * 1024;

/** Hosts whose JS bundles ship a known analytics SDK. Same-origin scripts
 *  are always probed in addition to these, since self-hosted SDK bundles
 *  contain the same signatures as the CDN-hosted ones. */
const ANALYTICS_CDN_HOST_SUFFIXES = [
  "posthog.com",
  "i.posthog.com",
  "plausible.io",
  "googletagmanager.com",
  "google-analytics.com",
  "analytics.google.com",
  "usefathom.com",
  "fathom.com",
  "cdn.splitbee.io",
  "splitbee.io",
  "simpleanalyticscdn.com",
  "simpleanalytics.com",
] as const;

export type AnalyticsProvider =
  | "posthog"
  | "plausible"
  | "ga4"
  | "gtm"
  | "fathom"
  | "splitbee"
  | "simple-analytics";

type ProviderRule = {
  provider: AnalyticsProvider;
  patterns: RegExp[];
};

/** SDK init signatures, keyed by provider. Mirrored 1:1 from the LRS-11
 *  brief's pattern list. Each pattern is anchored on a string the SDK
 *  emits unconditionally (init call, global flag, CDN URL). At least one
 *  match per provider is sufficient. */
const PROVIDER_RULES: ProviderRule[] = [
  {
    provider: "posthog",
    patterns: [/posthog\.init\s*\(/, /__POSTHOG_LOADED__/, /posthog-js/],
  },
  {
    provider: "plausible",
    patterns: [/plausible\s*\(\s*['"]/, /data-domain[^>]*plausible/],
  },
  {
    provider: "ga4",
    patterns: [
      /gtag\s*\(\s*['"]config['"]/,
      /googletagmanager\.com\/gtag\/js/,
      /__gtag__/,
    ],
  },
  {
    provider: "gtm",
    patterns: [/googletagmanager\.com\/gtm\.js/, /dataLayer\.push/],
  },
  {
    provider: "fathom",
    patterns: [/fathom\.com\/script\.js/, /fathomjs\b/],
  },
  {
    provider: "splitbee",
    patterns: [/cdn\.splitbee\.io/],
  },
  {
    provider: "simple-analytics",
    patterns: [/simpleanalyticscdn\.com/],
  },
];

/** Strings that strongly suggest the SDK is wired but not configured.
 *  Each is a copy-paste artefact from a typical README / vendor docs.
 *  Hitting any of these flips a `pass` to `warn` since the silent-noop
 *  failure mode (learnings.md #10) is exactly what we're trying to catch. */
const PLACEHOLDER_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /phc_REPLACE_ME/, label: "phc_REPLACE_ME" },
  { pattern: /YOUR_GA_ID/, label: "YOUR_GA_ID" },
  { pattern: /YOUR_POSTHOG_KEY/, label: "YOUR_POSTHOG_KEY" },
  { pattern: /UA-XXXXXX/, label: "UA-XXXXXX" },
  { pattern: /G-XXXXXX/, label: "G-XXXXXX" },
  { pattern: /GTM-XXXXXX/, label: "GTM-XXXXXX" },
  { pattern: /\b123-456\b/, label: "123-456" },
];

export type ScriptScanResult = {
  url: string;
  /** "same-origin" or "analytics-cdn" — explains why we scanned it. */
  reason: "same-origin" | "analytics-cdn";
  status: number | null;
  bytes: number;
  /** Captured network-error message if the GET failed before a status. */
  error?: string;
};

export type AnalyticsBeaconStaticEvidence = {
  providersDetected: AnalyticsProvider[];
  scriptsScanned: number;
  totalBytesScanned: number;
  suspectPlaceholders: string[];
  scripts: ScriptScanResult[];
  /** Set when the HTML had zero <script> tags. */
  skipped?: "no_scripts";
  /** Set when every script GET failed; we couldn't verify the body but a
   *  candidate src existed in the HTML. */
  inconclusive?: "all_fetches_failed";
};

export type AnalyticsBeaconStaticOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

/** Pure: extract all <script src> URLs from HTML, resolving relative refs
 *  against `baseUrl` and dropping data:/blob:/javascript: URIs. Inline
 *  <script> bodies are also collected separately so we can scan them
 *  in-place without a network round-trip. */
export function extractScriptsFromHtml(
  html: string,
  baseUrl: string,
): { externalScripts: string[]; inlineScripts: string[]; totalScriptTags: number } {
  const $ = cheerio.load(html);
  const externalScripts: string[] = [];
  const inlineScripts: string[] = [];
  let totalScriptTags = 0;
  $("script").each((_, el) => {
    totalScriptTags += 1;
    const src = $(el).attr("src");
    if (typeof src === "string" && src.trim().length > 0) {
      const trimmed = src.trim();
      const lower = trimmed.toLowerCase();
      if (lower.startsWith("data:") || lower.startsWith("blob:") || lower.startsWith("javascript:")) {
        return;
      }
      try {
        const absolute = new URL(trimmed, baseUrl).toString();
        externalScripts.push(absolute);
      } catch {
        // unresolvable URL — ignore
      }
      return;
    }
    // No src → inline body. Capture it for in-place regex scanning.
    const inline = $(el).text();
    if (typeof inline === "string" && inline.length > 0) {
      inlineScripts.push(inline);
    }
  });
  return { externalScripts, inlineScripts, totalScriptTags };
}

/** Pure: should we GET this script's body? Same-origin OR known
 *  analytics-CDN host. Anything else is unlikely to ship an analytics
 *  SDK and would just inflate the byte budget. */
export function shouldScanScript(
  scriptUrl: string,
  baseUrl: string,
): { scan: boolean; reason: ScriptScanResult["reason"] } | null {
  let scriptU: URL;
  let baseU: URL;
  try {
    scriptU = new URL(scriptUrl);
    baseU = new URL(baseUrl);
  } catch {
    return null;
  }
  if (scriptU.host === baseU.host) {
    return { scan: true, reason: "same-origin" };
  }
  const host = scriptU.host.toLowerCase();
  for (const suffix of ANALYTICS_CDN_HOST_SUFFIXES) {
    if (host === suffix || host.endsWith(`.${suffix}`)) {
      return { scan: true, reason: "analytics-cdn" };
    }
  }
  return null;
}

/** GET a script body with timeout + per-script byte cap. Returns the
 *  decoded text (truncated to the cap) plus status. Network errors are
 *  caught and surfaced on the result; we never throw RetryableError out
 *  of here because partial visibility is more useful than burning the
 *  whole evaluator on one transient. */
export async function fetchScriptBody(
  url: string,
  options: AnalyticsBeaconStaticOptions = {},
): Promise<{ status: number | null; body: string; bytes: number; error?: string }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "user-agent": "LaunchWings-LRS-Audit/0.1 (+https://launchwings.com)",
          accept: "application/javascript,text/javascript,*/*;q=0.1",
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isAbort = err instanceof Error && err.name === "AbortError";
      return {
        status: null,
        body: "",
        bytes: 0,
        error: isAbort ? `timeout after ${timeoutMs}ms` : message,
      };
    }
    if (res.status >= 400) {
      // Drain (and discard) the body to free the socket cleanly. Some
      // implementations hang if you don't.
      try {
        await res.text();
      } catch {
        // ignore
      }
      return { status: res.status, body: "", bytes: 0 };
    }
    let body = "";
    try {
      body = await res.text();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { status: res.status, body: "", bytes: 0, error: `body read failed: ${message}` };
    }
    if (body.length > PER_SCRIPT_BODY_CAP_BYTES) {
      body = body.slice(0, PER_SCRIPT_BODY_CAP_BYTES);
    }
    return { status: res.status, body, bytes: body.length };
  } finally {
    clearTimeout(timer);
  }
}

/** Pure: regex-scan a body for analytics SDK signatures. */
export function detectProviders(body: string): AnalyticsProvider[] {
  const out: AnalyticsProvider[] = [];
  for (const rule of PROVIDER_RULES) {
    if (rule.patterns.some((p) => p.test(body))) {
      out.push(rule.provider);
    }
  }
  return out;
}

/** Pure: scan a body for placeholder strings that suggest the SDK is
 *  shipped but misconfigured. Returns the labels of every match. */
export function detectPlaceholders(body: string): string[] {
  const hits = new Set<string>();
  for (const { pattern, label } of PLACEHOLDER_PATTERNS) {
    if (pattern.test(body)) hits.add(label);
  }
  return Array.from(hits);
}

export const analyticsBeaconStaticEvaluator: Evaluator = {
  id: "dogfood-LRS-11",
  title: "Analytics SDK present (static-analysis variant)",
  checklistRef:
    "Stage 1 item 17 (analytics installed — verified beacon fires) — static-analysis half",
  evaluate: async (target: AuditTarget, ctx: AuditContext): Promise<EvalResult> => {
    const start = ctx.now();
    const fetched = target.fetchedHtml
      ? { html: target.fetchedHtml, finalUrl: target.finalUrl ?? target.url, status: 200 }
      : await ctx.fetchHtml(target.url);
    const baseUrl = fetched.finalUrl || target.url;

    const { externalScripts, inlineScripts, totalScriptTags } = extractScriptsFromHtml(
      fetched.html,
      baseUrl,
    );

    // Degenerate case: no <script> tags at all. Surface as warn-skipped so
    // the founder sees the row exists, but don't punish a placeholder page.
    if (totalScriptTags === 0) {
      const evidence: AnalyticsBeaconStaticEvidence = {
        providersDetected: [],
        scriptsScanned: 0,
        totalBytesScanned: 0,
        suspectPlaceholders: [],
        scripts: [],
        skipped: "no_scripts",
      };
      return {
        evaluatorId: "dogfood-LRS-11",
        severity: "warn",
        score: 50,
        latencyMs: Math.max(0, ctx.now() - start),
        costUsdMicros: 0,
        evidenceJson: evidence as unknown as Record<string, unknown>,
        fixActionMarkdown:
          "No `<script>` tags in the shipped HTML — analytics-beacon detection skipped. If this is a placeholder page, ship the real site and re-run; if it's not, install an analytics SDK (PostHog, Plausible, GA4) so launch traffic is attributable. See [`dogfood-LRS-11`](docs/tickets/dogfood-LRS-11-analytics-beacon.md).",
      };
    }

    // Build the per-script scan plan: same-origin + known analytics CDNs.
    const scanPlan: Array<{ url: string; reason: ScriptScanResult["reason"] }> = [];
    for (const url of externalScripts) {
      const decision = shouldScanScript(url, baseUrl);
      if (decision?.scan) scanPlan.push({ url, reason: decision.reason });
    }

    // Aggregate scan budget: 10MB hard cap. Inline bodies are free
    // (already in memory) so we always include them.
    let aggregateBytes = 0;
    let aggregateBody = inlineScripts.join("\n");
    aggregateBytes += aggregateBody.length;

    const scriptResults: ScriptScanResult[] = [];

    // Probe scripts in parallel — each one is a 10s-bounded GET, so
    // even a script-heavy page completes in roughly one timeout window.
    const fetchedBodies = await Promise.all(
      scanPlan.map(async (plan) => {
        const out = await fetchScriptBody(plan.url);
        return { plan, out };
      }),
    );

    for (const { plan, out } of fetchedBodies) {
      const remainingBudget = AGGREGATE_BODY_CAP_BYTES - aggregateBytes;
      let appended = "";
      if (remainingBudget > 0 && out.body.length > 0) {
        appended = out.body.length > remainingBudget ? out.body.slice(0, remainingBudget) : out.body;
        aggregateBody += "\n" + appended;
        aggregateBytes += appended.length;
      }
      scriptResults.push({
        url: plan.url,
        reason: plan.reason,
        status: out.status,
        bytes: appended.length,
        ...(out.error ? { error: out.error } : {}),
      });
    }

    const providersDetected = detectProviders(aggregateBody);
    const suspectPlaceholders = detectPlaceholders(aggregateBody);

    const evidence: AnalyticsBeaconStaticEvidence = {
      providersDetected,
      scriptsScanned: scriptResults.length,
      totalBytesScanned: aggregateBytes,
      suspectPlaceholders,
      scripts: scriptResults,
    };

    const fixLink =
      "See [`dogfood-LRS-11`](docs/tickets/dogfood-LRS-11-analytics-beacon.md) — analytics is launch-attribution glue. Without it you can't tell which posts drove signups, and the silent-noop failure mode (PostHog SDK shipped but `NEXT_PUBLIC_POSTHOG_KEY` unset in Vercel) looks identical to a working SDK from the founder's POV.";

    // Pass: at least one provider, no placeholder strings.
    if (providersDetected.length > 0 && suspectPlaceholders.length === 0) {
      return {
        evaluatorId: "dogfood-LRS-11",
        severity: "pass",
        score: 100,
        latencyMs: Math.max(0, ctx.now() - start),
        costUsdMicros: 0,
        evidenceJson: evidence as unknown as Record<string, unknown>,
        fixActionMarkdown: `Detected analytics SDK signature${
          providersDetected.length === 1 ? "" : "s"
        }: ${providersDetected.join(", ")}. Static-analysis only — schedule the live-beacon variant once Browserbase is wired to confirm the SDK actually phones home (silent-noop is the failure mode this can't catch). ${fixLink}`,
      };
    }

    // Warn: provider detected but at least one placeholder string is
    // present in the same body. Strong signal that the SDK is shipped
    // but unconfigured.
    if (providersDetected.length > 0 && suspectPlaceholders.length > 0) {
      return {
        evaluatorId: "dogfood-LRS-11",
        severity: "warn",
        score: 60,
        latencyMs: Math.max(0, ctx.now() - start),
        costUsdMicros: 0,
        evidenceJson: evidence as unknown as Record<string, unknown>,
        fixActionMarkdown: `Analytics SDK detected (${providersDetected.join(
          ", ",
        )}) but the shipped JS contains placeholder strings (${suspectPlaceholders.join(
          ", ",
        )}). The SDK is wired but almost certainly misconfigured — set the production key in your hosting provider's env vars before launch. ${fixLink}`,
      };
    }

    // Inconclusive warn: scan plan had at least one candidate but every
    // GET failed (5xx / abort / network error). Don't punish a transient.
    const allFetchesFailed =
      scanPlan.length > 0 &&
      scriptResults.every((s) => s.status === null || s.status >= 500);
    if (allFetchesFailed) {
      return {
        evaluatorId: "dogfood-LRS-11",
        severity: "warn",
        score: 50,
        latencyMs: Math.max(0, ctx.now() - start),
        costUsdMicros: 0,
        evidenceJson: {
          ...evidence,
          inconclusive: "all_fetches_failed",
        } as unknown as Record<string, unknown>,
        fixActionMarkdown: `Could not verify analytics SDK presence — ${scriptResults.length} candidate script${
          scriptResults.length === 1 ? "" : "s"
        } returned 5xx or network errors. Conservative warn (assume present). Re-run the audit; if it persists, check your CDN's status. ${fixLink}`,
      };
    }

    // Fail: no provider signature anywhere we could see.
    return {
      evaluatorId: "dogfood-LRS-11",
      severity: "fail",
      score: 0,
      latencyMs: Math.max(0, ctx.now() - start),
      costUsdMicros: 0,
      evidenceJson: evidence as unknown as Record<string, unknown>,
      fixActionMarkdown: `No analytics SDK signature found in inline scripts or in any of the ${scriptResults.length} same-origin / analytics-CDN scripts we scanned. Install one of: PostHog, Plausible, GA4, GTM, Fathom, Splitbee, Simple Analytics. ${fixLink}`,
    };
  },
};

// Re-export RetryableError so consumers that only import this module can
// distinguish runner-retry-eligible failures from logic bugs without
// pulling in `../types` directly. (Mirrors how og-image.ts surfaces it.)
export { RetryableError };
