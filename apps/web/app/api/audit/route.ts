import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";
import { z } from "zod";
import {
  runEvaluators,
  stage1Evaluators,
  type AuditTarget,
  type EvalResult,
  type LlmFn,
  type RunSummary,
} from "@launchwings/lrs";
import { persistAnonymousRun } from "@/lib/audit-persist";

// LRC-01 PR4 — public anonymous audit demo wired into apps/web.
//
// Deliberate design choices:
//
// 1. **Anonymous, no DB.** We pass `persistResults: false` to the runner. No
//    tenant scope, no row in `lrs_runs`. This is the marketing demo — privacy
//    + cheap-to-run. Authenticated audits go through the Trigger.dev task.
//
// 2. **Edge runtime is wrong here.** We need `node:dns/promises`, cheerio,
//    and full fetch. `runtime = "nodejs"` is required.
//
// 3. **SSRF guard before fetch.** We resolve every hostname via DNS and
//    reject if any A/AAAA result is private/loopback/link-local. After fetch,
//    we re-check the redirected URL host the same way. AbortSignal caps the
//    request at 10s; ReadableStream consumption caps at 5MB.
//
// 4. **In-memory rate limit.** 5 requests / hour per IP via a Map. v1 — no
//    Redis, no Upstash. The limiter resets across deploys; that's fine for a
//    demo. Memory bound: ~64 bytes per IP × thousands → low single-digit MB.
//
// 5. **Result cache.** Same URL within 1h returns the same audit. Avoids both
//    "user double-clicked" and "user wants a fresh load" — a 1h TTL is
//    short enough that meaningful product changes aren't masked, long enough
//    to deflect the obvious abuse vector.
//
// 6. **Status-code convention** mirrors `apps/web/app/api/waitlist/route.ts`:
//    HTTP 200 on success, 4xx on user errors, 5xx for our bugs. Even if the
//    target URL returns 500, we return HTTP 200 with the failure baked into
//    `summary.error` — the audit's whole job is to surface what's wrong.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---- Constants ------------------------------------------------------------

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MB
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RESULT_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const TURNSTILE_VERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// ---- Module-level state ---------------------------------------------------
// Note: `globalThis` keys keep state stable across hot-reloads in dev; in
// prod (single Node process per Vercel function instance) it's a normal Map.

type RateBucket = { count: number; resetAt: number };
type CachedRun = { expiresAt: number; payload: AuditResponse };

const RATE_KEY = "__lrc01_rate_buckets";
const CACHE_KEY = "__lrc01_audit_cache";

const rateBuckets: Map<string, RateBucket> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ((globalThis as any)[RATE_KEY] ??= new Map<string, RateBucket>());
const resultCache: Map<string, CachedRun> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ((globalThis as any)[CACHE_KEY] ??= new Map<string, CachedRun>());

// ---- Schema ---------------------------------------------------------------

const BodySchema = z.object({
  url: z
    .string()
    .url()
    .max(2048)
    .refine((s) => /^https?:\/\//i.test(s), "URL must use http(s)"),
  turnstileToken: z.string().min(1).optional().nullable(),
});

// ---- Logging --------------------------------------------------------------

function log(line: Record<string, unknown>): void {
  // Single-line JSON, per repo convention.
  console.log(JSON.stringify({ source: "api-audit", ...line }));
}

// ---- SSRF guard -----------------------------------------------------------

const PRIVATE_HOSTS = new Set([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
  "broadcasthost",
]);

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return false;
  const [a, b] = parts as [number, number, number, number];
  // 0.0.0.0/8
  if (a === 0) return true;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 127.0.0.0/8
  if (a === 127) return true;
  // 169.254.0.0/16 (link-local)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 100.64.0.0/10 (CGNAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 224.0.0.0/4 multicast
  if (a >= 224) return true;
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return true;
  // Link-local fe80::/10
  if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) {
    return true;
  }
  // Unique local fc00::/7
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  // IPv4-mapped ::ffff:a.b.c.d
  if (lower.startsWith("::ffff:")) {
    const v4 = lower.slice(7);
    if (v4.includes(".")) return isPrivateIPv4(v4);
  }
  // IPv4-compatible ::a.b.c.d (deprecated but still possible)
  if (/^::\d+\.\d+\.\d+\.\d+$/.test(lower)) {
    return isPrivateIPv4(lower.slice(2));
  }
  return false;
}

function isPrivateAddr(ip: string): boolean {
  const family = net.isIP(ip);
  if (family === 4) return isPrivateIPv4(ip);
  if (family === 6) return isPrivateIPv6(ip);
  return true; // unknown — fail closed
}

/** Resolve hostname; return resolved IPs or throw with a reason. */
async function assertPublicHost(hostname: string): Promise<string[]> {
  const lower = hostname.toLowerCase();
  if (PRIVATE_HOSTS.has(lower)) {
    throw new SsrfError(`hostname "${hostname}" is in the private list`);
  }
  // If hostname is itself a literal IP, validate directly.
  const family = net.isIP(hostname);
  if (family !== 0) {
    if (isPrivateAddr(hostname)) {
      throw new SsrfError(`literal IP "${hostname}" is private/loopback`);
    }
    return [hostname];
  }
  // DNS lookup. Use resolve4/resolve6 (fail open per record type — many domains
  // only have one family).
  const ips: string[] = [];
  await Promise.allSettled([
    dns.resolve4(hostname).then((rs) => ips.push(...rs)).catch(() => undefined),
    dns.resolve6(hostname).then((rs) => ips.push(...rs)).catch(() => undefined),
  ]);
  if (ips.length === 0) {
    throw new SsrfError(`hostname "${hostname}" did not resolve`);
  }
  for (const ip of ips) {
    if (isPrivateAddr(ip)) {
      throw new SsrfError(
        `hostname "${hostname}" resolves to private IP "${ip}"`,
      );
    }
  }
  return ips;
}

class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

// ---- Rate limiting --------------------------------------------------------

function clientIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

function checkRateLimit(ip: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  // Lazy GC of expired buckets; bounded by RATE_LIMIT_MAX writes per actor.
  if (rateBuckets.size > 10_000) {
    for (const [k, v] of rateBuckets) {
      if (v.resetAt <= now) rateBuckets.delete(k);
    }
  }
  const existing = rateBuckets.get(ip);
  if (!existing || existing.resetAt <= now) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { ok: true };
  }
  if (existing.count >= RATE_LIMIT_MAX) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  existing.count += 1;
  return { ok: true };
}

// ---- Fetch with timeout + body cap ---------------------------------------

type FetchOutcome =
  | { ok: true; html: string; status: number; finalUrl: string }
  | { ok: false; error: string; status?: number };

async function safeFetchHtml(url: string): Promise<FetchOutcome> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ac.signal,
      headers: {
        "user-agent": "LaunchWings-LRS-Audit/0.1 (+https://launchwings.com)",
        accept: "text/html,application/xhtml+xml",
      },
    });

    // After redirects, re-check the final host against the SSRF guard.
    try {
      const finalHost = new URL(res.url).hostname;
      await assertPublicHost(finalHost);
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof SsrfError
            ? `redirected_to_private_host: ${err.message}`
            : "redirect_check_failed",
        status: res.status,
      };
    }

    if (res.status < 200 || res.status >= 300) {
      return { ok: false, error: "fetch_failed", status: res.status };
    }

    // Stream the body with a hard byte cap.
    const body = res.body;
    if (!body) {
      return { ok: true, html: "", status: res.status, finalUrl: res.url };
    }
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        try {
          await reader.cancel();
        } catch {
          /* ignore */
        }
        return { ok: false, error: "body_too_large", status: res.status };
      }
      chunks.push(value);
    }
    // Concatenate. TextDecoder handles encoding fallback (utf-8 default).
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.byteLength;
    }
    const html = new TextDecoder("utf-8", { fatal: false }).decode(merged);
    return { ok: true, html, status: res.status, finalUrl: res.url };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, error: "timeout" };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `fetch_error: ${message}` };
  } finally {
    clearTimeout(timer);
  }
}

// ---- Score aggregation ----------------------------------------------------

const SEVERITY_WEIGHT: Record<EvalResult["severity"], number> = {
  pass: 1,
  warn: 1.5,
  fail: 2,
};

export type AuditSummary = {
  pass: number;
  warn: number;
  fail: number;
  /** 0–100. Severity-weighted average of evaluator scores. */
  score: number;
  /** Optional: present when the target fetch failed. */
  error?: string;
  status?: number;
};

function buildSummary(
  results: EvalResult[],
  runnerSummary: RunSummary,
  fetchError?: { error: string; status?: number },
): AuditSummary {
  if (fetchError) {
    return {
      pass: 0,
      warn: 0,
      fail: 0,
      score: 0,
      error: fetchError.error,
      ...(typeof fetchError.status === "number" ? { status: fetchError.status } : {}),
    };
  }
  let weightedTotal = 0;
  let totalWeight = 0;
  for (const r of results) {
    const w = SEVERITY_WEIGHT[r.severity];
    weightedTotal += r.score * w;
    totalWeight += w;
  }
  const score = totalWeight > 0 ? Math.round(weightedTotal / totalWeight) : 0;
  return {
    pass: runnerSummary.pass,
    warn: runnerSummary.warn,
    fail: runnerSummary.fail,
    score,
  };
}

// ---- Optional LLM hook ----------------------------------------------------

// Loose typing: we dynamic-import @launchwings/agents/llm only when the env
// flag is on. apps/web doesn't list agents as a dependency (kept out of the
// hot path bundle); we treat the module shape opaquely here. The cycle-check:
// agents → lrs is the only direction wired in package graph, so apps/web →
// agents at runtime is safe (no cycle introduced).
type AgentsLlmCallable = (req: {
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  system?: string;
  maxOutputTokens?: number;
  temperature?: number;
}) => Promise<{ text: string; costUsdMicros: number; modelUsed: string }>;

async function dynamicImportAgentsLlm(): Promise<AgentsLlmCallable | null> {
  // We construct the module specifier dynamically so TypeScript doesn't try
  // to resolve types for it (apps/web does not depend on @launchwings/agents
  // — the runtime resolution still works inside the pnpm workspace because
  // node resolution walks node_modules, but typescript can't see it).
  const specifier = "@launchwings/agents/llm";
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
  const mod = (await (Function("s", "return import(s)") as (s: string) => Promise<unknown>)(
    specifier,
  )) as { llm?: AgentsLlmCallable };
  return typeof mod?.llm === "function" ? mod.llm : null;
}

async function maybeBuildLlmFn(): Promise<LlmFn | undefined> {
  if (process.env.AUDIT_LLM_ENABLED !== "true") return undefined;
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  if (!hasAnthropic && !hasOpenAI) return undefined;
  try {
    const llmCall = await dynamicImportAgentsLlm();
    if (!llmCall) return undefined;
    return async (opts) => {
      const res = await llmCall({
        model: opts.model,
        messages: opts.messages,
        ...(opts.system !== undefined ? { system: opts.system } : {}),
        ...(opts.maxTokens !== undefined ? { maxOutputTokens: opts.maxTokens } : {}),
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      });
      return {
        text: res.text,
        costUsdMicros: res.costUsdMicros,
        modelUsed: res.modelUsed,
      };
    };
  } catch (err) {
    log({
      level: "warn",
      message: "llm_import_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

// ---- Response shape -------------------------------------------------------

export type AuditResponse = {
  ok: true;
  runId: string;
  finishedAt: string;
  summary: AuditSummary;
  results: EvalResult[];
};

// ---- Cache ---------------------------------------------------------------

function cacheKeyFor(url: string): string {
  // Date partition keeps the cache from going stale across day boundaries.
  const day = new Date().toISOString().slice(0, 10);
  return `${day}::${url}`;
}

function getCached(url: string): AuditResponse | null {
  const key = cacheKeyFor(url);
  const hit = resultCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    resultCache.delete(key);
    return null;
  }
  return hit.payload;
}

function setCached(url: string, payload: AuditResponse): void {
  if (resultCache.size > 5_000) {
    // Crude bounded GC: drop the oldest 10% by walk order. For a marketing
    // demo this is fine; if traffic warrants more we'll move to LRU.
    const toDrop = Math.ceil(resultCache.size * 0.1);
    let i = 0;
    for (const k of resultCache.keys()) {
      if (i >= toDrop) break;
      resultCache.delete(k);
      i += 1;
    }
  }
  resultCache.set(cacheKeyFor(url), {
    expiresAt: Date.now() + RESULT_CACHE_TTL_MS,
    payload,
  });
}

// ---- Turnstile ------------------------------------------------------------

async function verifyTurnstile(token: string | null | undefined, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // skipped when unset
  if (!token) return false;
  try {
    const verifyRes = await fetch(TURNSTILE_VERIFY, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    });
    const verify = (await verifyRes.json()) as { success?: boolean };
    return Boolean(verify.success);
  } catch {
    return false;
  }
}

// ---- Handler --------------------------------------------------------------

export async function POST(req: Request): Promise<Response> {
  const ip = clientIp(req);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Bad JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "Invalid request body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { url, turnstileToken } = parsed.data;

  // Turnstile (mirrors waitlist). Skipped if secret unset.
  const captchaOk = await verifyTurnstile(turnstileToken ?? null, ip);
  if (!captchaOk) {
    log({ level: "warn", message: "captcha_failed", ip });
    return NextResponse.json({ ok: false, message: "Captcha failed" }, { status: 400 });
  }

  // Rate limit.
  const rl = checkRateLimit(ip);
  if (!rl.ok) {
    log({ level: "warn", message: "rate_limited", ip, retryAfterSec: rl.retryAfterSec });
    return NextResponse.json(
      { ok: false, message: "Rate limit exceeded", retryAfterSec: rl.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  // Parse URL + run SSRF guard before any network egress.
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({ ok: false, message: "Malformed URL" }, { status: 400 });
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return NextResponse.json(
      { ok: false, message: "Only http(s) URLs are supported" },
      { status: 400 },
    );
  }

  try {
    await assertPublicHost(parsedUrl.hostname);
  } catch (err) {
    if (err instanceof SsrfError) {
      log({ level: "warn", message: "ssrf_blocked", ip, host: parsedUrl.hostname, reason: err.message });
      return NextResponse.json(
        {
          ok: false,
          message:
            "We can't audit private or internal URLs. Try a publicly reachable production URL.",
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { ok: false, message: "Could not resolve hostname" },
      { status: 400 },
    );
  }

  // Cache hit?
  const cached = getCached(url);
  if (cached) {
    log({ level: "info", message: "cache_hit", ip, url });
    return NextResponse.json(cached);
  }

  const runId = randomUUID();
  const startedAt = Date.now();

  // Fetch the target HTML.
  const fetched = await safeFetchHtml(url);
  if (!fetched.ok) {
    log({
      level: "info",
      message: "fetch_failed",
      runId,
      ip,
      url,
      error: fetched.error,
      status: fetched.status,
    });
    const payload: AuditResponse = {
      ok: true,
      runId,
      finishedAt: new Date().toISOString(),
      summary: buildSummary([], emptySummary(), {
        error: fetched.error,
        ...(typeof fetched.status === "number" ? { status: fetched.status } : {}),
      }),
      results: [],
    };
    return NextResponse.json(payload);
  }

  const target: AuditTarget = {
    url,
    fetchedHtml: fetched.html,
    finalUrl: fetched.finalUrl,
  };

  const llm = await maybeBuildLlmFn();

  let results: EvalResult[] = [];
  let runnerSummary: RunSummary = emptySummary();
  try {
    const run = await runEvaluators(target, stage1Evaluators(), {
      persistResults: false,
      runId,
      ...(llm ? { llm } : {}),
    });
    results = run.results;
    runnerSummary = run.summary;
  } catch (err) {
    log({
      level: "error",
      message: "runner_threw",
      runId,
      ip,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { ok: false, message: "Audit harness errored. Please retry shortly." },
      { status: 500 },
    );
  }

  const finishedAtDate = new Date();
  const payload: AuditResponse = {
    ok: true,
    runId,
    finishedAt: finishedAtDate.toISOString(),
    summary: buildSummary(results, runnerSummary),
    results,
  };

  setCached(url, payload);

  // Best-effort permalink persistence. If DATABASE_URL is unset we skip
  // silently (helper logs once per process); on failure the helper logs a
  // structured warn and we still return the live payload below.
  await persistAnonymousRun({
    runId,
    targetUrl: url,
    startedAt: new Date(startedAt),
    finishedAt: finishedAtDate,
    summary: payload.summary,
    results: payload.results,
  });

  log({
    level: "info",
    message: "audit_completed",
    runId,
    ip,
    url,
    durationMs: Date.now() - startedAt,
    pass: payload.summary.pass,
    warn: payload.summary.warn,
    fail: payload.summary.fail,
    score: payload.summary.score,
    llmEnabled: Boolean(llm),
  });

  return NextResponse.json(payload);
}

function emptySummary(): RunSummary {
  return {
    total: 0,
    pass: 0,
    warn: 0,
    fail: 0,
    errored: 0,
    totalEvaluatorMs: 0,
    totalCostUsdMicros: 0,
  };
}
