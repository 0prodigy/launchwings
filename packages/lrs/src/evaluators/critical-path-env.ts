import * as cheerio from "cheerio";
import { RetryableError, type AuditContext, type AuditTarget, type EvalResult, type Evaluator } from "../types";

// LRS-CRITICAL-PATH-001 — declared-endpoint reachability + waitlist probe.
//
// Per docs/dogfood/learnings.md #10 (silent-fail waitlist API: missing
// RESEND_API_KEY → server returned 200 with `{ok:true,queued:false}`,
// frontend showed success) and #12 (og:image meta tag pointed at a 404):
// both bugs share the "advertised capability vs actual capability" shape.
// The site claims to do something; the API silently doesn't.
//
// PR3 scope (intentionally tight — see lrs-critical-path-001-* ticket
// "Out of scope" section for the harder variants):
//
//  1. Detect declared API endpoints in the shipped HTML:
//     - <form action="...">
//     - <button data-api-endpoint="...">
//
//  2. For each declared endpoint:
//       HEAD it (some servers reject HEAD; we fall back to OPTIONS).
//       - 200 / 204 / 405          → endpoint exists ✓
//       - 404                       → fail (declared but missing)
//       - 5xx                       → warn (config drift?)
//
//  3. For any waitlist-shaped endpoint (`/api/waitlist`, contains `signup`
//     or `subscribe`): synthetic POST with sentinel email
//     `audit+${runId}@launchwings.com` and `X-LaunchWings-Audit: 1`.
//
//     - non-2xx response                 → pass (correctly surfacing failure)
//     - 2xx with `{ok:true,...}` body    → warn ("verify the EMAIL-001
//                                          synthetic-monitor pattern; we
//                                          have no inbox access from the
//                                          sandbox to confirm delivery")
//     - 2xx without ok flag              → warn (response shape unverified)
//     - 2xx with `{ok:false,...}` body   → pass (route surfaced the failure)
//
// Verdict ladder is the worst-of-all per-finding severity:
//   any fail → fail; else any warn → warn; else pass.
//
// Network failures during the probe are RetryableError so the runner can
// retry transient blips without burning the eval as a hard fail.
//
// Wiring critical-path env-var detection in compiled JS chunks (the
// stronger variant from learnings.md #10) is explicitly PR4+.

const FETCH_TIMEOUT_MS = 8_000;

type EndpointSource = "form-action" | "button-data-api-endpoint";

export type DeclaredEndpoint = {
  source: EndpointSource;
  url: string;
};

export type EndpointProbeResult = {
  endpoint: DeclaredEndpoint;
  method: "HEAD" | "OPTIONS";
  status: number | null;
  /** "exists" / "missing" / "server_error". */
  classification: "exists" | "missing" | "server_error" | "probe_failed";
  /** True if this looks like a waitlist endpoint we then POSTed against. */
  isWaitlistShape: boolean;
};

export type WaitlistProbeResult = {
  endpoint: DeclaredEndpoint;
  status: number | null;
  okShape: boolean | null;
  bodyOk: boolean | null;
  /** A sample of the parsed body (truncated for evidence storage). */
  bodyPreview: string | null;
  /** Severity contribution per the ladder above. */
  outcome: "pass" | "warn" | "fail";
};

export type CriticalPathEvidence = {
  declaredEndpoints: DeclaredEndpoint[];
  endpointResults: EndpointProbeResult[];
  waitlistResults: WaitlistProbeResult[];
};

export type CriticalPathProbeDeps = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const WAITLIST_SHAPE_RX = /\/api\/waitlist|signup|subscribe/i;

function looksWaitlist(url: string): boolean {
  return WAITLIST_SHAPE_RX.test(url);
}

function resolveAbsolute(maybeRelative: string, baseUrl: string): string | null {
  try {
    return new URL(maybeRelative, baseUrl).toString();
  } catch {
    return null;
  }
}

/** Pure: scrape declared endpoints out of HTML. */
export function parseDeclaredEndpointsFromHtml(
  html: string,
  baseUrl: string,
): DeclaredEndpoint[] {
  const $ = cheerio.load(html);
  const found: DeclaredEndpoint[] = [];
  const seen = new Set<string>();
  const push = (source: EndpointSource, raw: string | undefined) => {
    if (!raw) return;
    const trimmed = raw.trim();
    if (!trimmed) return;
    const abs = resolveAbsolute(trimmed, baseUrl);
    if (!abs) return;
    // De-dup by source+url so the same endpoint declared twice doesn't get
    // probed twice. We keep the first occurrence's source.
    const key = `${source}::${abs}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ source, url: abs });
  };
  $("form").each((_, el) => push("form-action", $(el).attr("action")));
  $("button[data-api-endpoint]").each((_, el) =>
    push("button-data-api-endpoint", $(el).attr("data-api-endpoint")),
  );
  return found;
}

async function withTimeoutFetch(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Probe a declared endpoint with HEAD; fall back to OPTIONS if HEAD fails. */
export async function probeEndpoint(
  endpoint: DeclaredEndpoint,
  deps: CriticalPathProbeDeps = {},
): Promise<EndpointProbeResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? FETCH_TIMEOUT_MS;

  const isWaitlist = looksWaitlist(endpoint.url);

  const tryRequest = async (
    method: "HEAD" | "OPTIONS",
  ): Promise<{ status: number; method: "HEAD" | "OPTIONS" } | "network_error"> => {
    try {
      const res = await withTimeoutFetch(
        fetchImpl,
        endpoint.url,
        {
          method,
          redirect: "follow",
          headers: {
            "user-agent": "LaunchWings-LRS-Audit/0.1 (+https://launchwings.com)",
          },
        },
        timeoutMs,
      );
      return { status: res.status, method };
    } catch {
      return "network_error";
    }
  };

  const head = await tryRequest("HEAD");
  let chosen: { status: number; method: "HEAD" | "OPTIONS" } | "network_error" = head;
  if (head === "network_error") {
    chosen = await tryRequest("OPTIONS");
  }

  if (chosen === "network_error") {
    // Both HEAD and OPTIONS failed at the network layer — surface as
    // retryable so the runner gets one more chance before declaring a hard
    // probe-failed. The runner wraps that into a fail row already.
    throw new RetryableError(
      `critical-path probe of ${endpoint.url} failed at the network layer`,
    );
  }

  const status = chosen.status;
  let classification: EndpointProbeResult["classification"];
  if (status === 200 || status === 204 || status === 405) {
    classification = "exists";
  } else if (status === 404) {
    classification = "missing";
  } else if (status >= 500 && status < 600) {
    classification = "server_error";
  } else {
    // Treat 401/403 as "exists" — the route is wired, it's just gating us.
    // Anything else (3xx after redirect-follow shouldn't happen, but…) we
    // also call "exists": the route accepted the method.
    classification = "exists";
  }

  return {
    endpoint,
    method: chosen.method,
    status,
    classification,
    isWaitlistShape: isWaitlist,
  };
}

/** Synthetic POST against a waitlist-shaped endpoint with the sentinel
 *  email + `X-LaunchWings-Audit: 1` header. */
export async function probeWaitlist(
  endpoint: DeclaredEndpoint,
  runId: string,
  deps: CriticalPathProbeDeps = {},
): Promise<WaitlistProbeResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? FETCH_TIMEOUT_MS;

  const sentinel = `audit+${runId}@launchwings.com`;
  let res: Response;
  try {
    res = await withTimeoutFetch(
      fetchImpl,
      endpoint.url,
      {
        method: "POST",
        redirect: "follow",
        headers: {
          "content-type": "application/json",
          "user-agent": "LaunchWings-LRS-Audit/0.1 (+https://launchwings.com)",
          "x-launchwings-audit": "1",
        },
        body: JSON.stringify({ email: sentinel }),
      },
      timeoutMs,
    );
  } catch (err) {
    throw new RetryableError(
      `waitlist probe failed at network layer: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  const status = res.status;
  let body: unknown = null;
  let text: string | null = null;
  try {
    text = await res.text();
    if (text) body = JSON.parse(text);
  } catch {
    // Non-JSON body. okShape stays false; bodyPreview retains the raw text.
  }

  const isObj =
    typeof body === "object" && body !== null && !Array.isArray(body);
  const okShape = isObj && typeof (body as Record<string, unknown>).ok === "boolean";
  const bodyOk = okShape ? ((body as { ok: boolean }).ok ?? null) : null;

  const preview = text ? text.slice(0, 280) : null;

  let outcome: WaitlistProbeResult["outcome"];
  if (status >= 200 && status < 300) {
    if (okShape && bodyOk === false) {
      // Route is correctly surfacing the failure as a structured message.
      outcome = "pass";
    } else if (okShape && bodyOk === true) {
      // Server says ok, but we have no way to verify the downstream side
      // effect (no inbox access). Per spec: warn and recommend EMAIL-001.
      outcome = "warn";
    } else {
      // 2xx with a non-`{ok:bool}` shape — we couldn't verify anything.
      outcome = "warn";
    }
  } else {
    // Non-2xx: route is correctly surfacing failure (e.g. 503 when
    // RESEND_API_KEY is unset, 502 mid-deploy). That's the GOOD behaviour
    // per learnings.md #10's hardened variant.
    outcome = "pass";
  }

  return {
    endpoint,
    status,
    okShape: okShape || null,
    bodyOk,
    bodyPreview: preview,
    outcome,
  };
}

/** Combine endpoint probe results + waitlist probe results into the final
 *  EvalResult-shaped object. Pure-ish (takes results, returns shape). */
export function judgeCriticalPath(args: {
  endpointResults: EndpointProbeResult[];
  waitlistResults: WaitlistProbeResult[];
  declaredEndpoints: DeclaredEndpoint[];
}): {
  severity: EvalResult["severity"];
  score: number;
  evidence: CriticalPathEvidence;
  fixActionMarkdown: string;
} {
  const { endpointResults, waitlistResults, declaredEndpoints } = args;
  const evidence: CriticalPathEvidence = {
    declaredEndpoints,
    endpointResults,
    waitlistResults,
  };

  if (declaredEndpoints.length === 0) {
    // Nothing to probe. We don't fail — many landing pages are lead-magnet
    // only. Score in the 80s reflects "passed because nothing to test".
    return {
      severity: "pass",
      score: 85,
      evidence,
      fixActionMarkdown:
        "No declared API endpoints (`<form action>` or `<button data-api-endpoint>`) found on the page. " +
        "Critical-path probe was skipped. If you DO have a waitlist or signup form, ensure the form's `action` attribute points at the API route so this evaluator can probe it.",
    };
  }

  const fails: string[] = [];
  const warns: string[] = [];

  for (const r of endpointResults) {
    if (r.classification === "missing") {
      fails.push(
        `Endpoint \`${r.endpoint.url}\` (declared via ${r.endpoint.source}) returned 404 on ${r.method}. ` +
          "The UI promises an API that doesn't exist — every submit silently fails.",
      );
    } else if (r.classification === "server_error") {
      warns.push(
        `Endpoint \`${r.endpoint.url}\` returned ${r.status} on ${r.method}. ` +
          "Could be transient deploy / config drift; re-run before treating as a real outage.",
      );
    } else if (r.classification === "probe_failed") {
      warns.push(
        `Endpoint \`${r.endpoint.url}\` could not be probed (network error). Re-run; if it persists, the endpoint may be firewalled.`,
      );
    }
  }

  for (const w of waitlistResults) {
    if (w.outcome === "warn") {
      warns.push(
        `Waitlist-shaped endpoint \`${w.endpoint.url}\` returned ${w.status} ` +
          (w.okShape
            ? "with `{ok:true,...}` — but the audit sandbox has no inbox access to verify a real email actually sent. " +
              "Pair this evaluator with the **EMAIL-001 synthetic-monitor pattern** (every 5 min, real test send + alert on no-arrival) to close the silent-fail loop captured in `learnings.md` #10."
            : "with an unrecognised body shape. Make the route return `{ok: bool, message?: string}` so this evaluator can verify it."),
      );
    }
  }

  if (fails.length > 0) {
    return {
      severity: "fail",
      score: Math.max(0, 50 - fails.length * 15),
      evidence,
      fixActionMarkdown:
        "Critical-path probe found declared endpoints that don't exist:\n\n- " + fails.join("\n- "),
    };
  }
  if (warns.length > 0) {
    return {
      severity: "warn",
      score: 70,
      evidence,
      fixActionMarkdown:
        "Critical-path probe surfaced soft findings worth a manual look:\n\n- " + warns.join("\n- "),
    };
  }
  return {
    severity: "pass",
    score: 100,
    evidence,
    fixActionMarkdown:
      `Probed ${endpointResults.length} declared endpoint(s) + ${waitlistResults.length} waitlist-shaped POST(s). ` +
      "All exist or correctly surface failure. No action needed.",
  };
}

export const criticalPathEnvEvaluator: Evaluator = {
  id: "LRS-CRITICAL-PATH-001",
  title: "Critical-path env / declared-endpoint probe",
  checklistRef: "learnings.md #10 + #12 cluster (advertised vs actual capability)",
  evaluate: async (target: AuditTarget, ctx: AuditContext): Promise<EvalResult> => {
    const start = ctx.now();
    const fetched = target.fetchedHtml
      ? { html: target.fetchedHtml, finalUrl: target.finalUrl ?? target.url, status: 200 }
      : await ctx.fetchHtml(target.url);
    const baseUrl = fetched.finalUrl || target.url;
    const declaredEndpoints = parseDeclaredEndpointsFromHtml(fetched.html, baseUrl);

    // Probe each in parallel — small N (typically 1-3 forms on a landing page).
    const endpointResults = await Promise.all(
      declaredEndpoints.map(async (endpoint) => {
        try {
          return await probeEndpoint(endpoint);
        } catch (err) {
          // Convert RetryableError into a probe_failed result instead of
          // re-throwing; the runner's retry policy retries the WHOLE
          // evaluator, but we want partial visibility on multi-endpoint
          // pages (don't throw the whole audit because one endpoint timed
          // out).
          return {
            endpoint,
            method: "HEAD" as const,
            status: null,
            classification: "probe_failed" as const,
            isWaitlistShape: looksWaitlist(endpoint.url),
          };
        }
      }),
    );

    // Synthetic POST against any waitlist-shaped endpoint that exists.
    const waitlistTargets = endpointResults.filter(
      (r) => r.isWaitlistShape && r.classification === "exists",
    );
    const waitlistResults: WaitlistProbeResult[] = await Promise.all(
      waitlistTargets.map(async (r) => {
        try {
          return await probeWaitlist(r.endpoint, ctx.runId);
        } catch (err) {
          return {
            endpoint: r.endpoint,
            status: null,
            okShape: null,
            bodyOk: null,
            bodyPreview:
              err instanceof Error ? `probe-error: ${err.message}` : String(err),
            outcome: "warn" as const,
          };
        }
      }),
    );

    const judged = judgeCriticalPath({
      endpointResults,
      waitlistResults,
      declaredEndpoints,
    });

    return {
      evaluatorId: "LRS-CRITICAL-PATH-001",
      severity: judged.severity,
      score: judged.score,
      latencyMs: Math.max(0, ctx.now() - start),
      costUsdMicros: 0,
      evidenceJson: judged.evidence as unknown as Record<string, unknown>,
      fixActionMarkdown: judged.fixActionMarkdown,
    };
  },
};
