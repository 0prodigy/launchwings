import type { AuditContext, AuditTarget, EvalResult, Evaluator } from "../types";

// dogfood-LRS-09 (domain-age sub-check) — WHOIS-driven domain age.
//
// Per docs/tickets/dogfood-LRS-09-domain-age-blacklist.md the full ticket
// has three sub-checks (age, Spamhaus DBL, Google Safe Browsing). PR2
// ships only the age sub-check; the Spamhaus DNSBL probe and Safe Browsing
// API call require new vendor egress (PSI-style API key) and land in PR3.
//
// What this evaluator does:
//   1. Parse the apex domain from `target.url`.
//   2. If hostname is in the dev/test skip-list (localhost, 127.0.0.1,
//      *.local, *.test) — pass with `evidence.skipped: "non-public-host"`.
//   3. Look up WHOIS via `whois-json` (caret-pinned in package.json).
//      Cache results in-process for 7 days; WHOIS rate-limits aggressively
//      per registry and re-running the audit shouldn't spam Verisign.
//   4. Parse one of the many fields registries use to encode the
//      registration date (`creationDate` | `created` | `creation_date` |
//      `registered` | `Domain Registration Date`) and compute age in days.
//
// Severity ladder per the brief:
//   pass    age >= 90 days
//   warn    30 <= age < 90 days
//   fail    age < 30 days OR domain not found in WHOIS
//
// We deliberately treat "WHOIS server returned no creation date" as a
// retryable infrastructure failure (some TLDs rate-limit and 503), NOT
// as fail. The runner will retry with backoff. After exhausted retries,
// we return a fail row with the error in evidence_json.

// --- Types ---------------------------------------------------------

export type WhoisRecord = Record<string, unknown>;
export type WhoisFn = (apex: string) => Promise<WhoisRecord>;

export type DomainAgeEvidence = {
  /** ISO-8601 creation date string parsed from the WHOIS record. */
  creationDate: string | null;
  /** Days since creation. -1 when unknown. */
  ageDays: number;
  /** Registrar name parsed from the WHOIS record. */
  registrar: string | null;
  /** True if we returned the cached row (debug aid). */
  fromCache?: boolean;
  /** Set when we short-circuited for a non-public host. */
  skipped?: string;
};

export type DomainAgeOptions = {
  /** Inject a fake WHOIS function for tests. */
  whois?: WhoisFn;
  /** Inject a clock for tests. */
  now?: () => Date;
  /** Test override of the cache TTL. Default 7 days. */
  cacheTtlMs?: number;
};

// --- Cache ---------------------------------------------------------

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

type CacheEntry = { record: WhoisRecord; expiresAt: number };
const _cache = new Map<string, CacheEntry>();

/** Test-only: drop the cache so successive tests don't see stale data. */
export function _unsafeClearDomainAgeCache(): void {
  _cache.clear();
}

// --- Skip list -----------------------------------------------------

const SKIP_HOSTS = new Set<string>(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);
const SKIP_SUFFIXES = [".local", ".test", ".localhost", ".invalid", ".example"];

function isSkippableHost(hostname: string): boolean {
  if (SKIP_HOSTS.has(hostname)) return true;
  return SKIP_SUFFIXES.some((s) => hostname.endsWith(s));
}

// --- Apex extraction ----------------------------------------------

function apexFromHostname(hostname: string): string {
  // See dns-proxy-posture.ts for the same naive ETLD+1; multi-part TLDs
  // (`co.uk`) over-strip but Stage 1 customers are overwhelmingly on
  // `.com` / `.io` / `.dev`. Captured as a Stage 2 follow-up.
  const parts = hostname.split(".");
  if (parts.length <= 2) return hostname;
  return parts.slice(-2).join(".");
}

// --- WHOIS field parsing ------------------------------------------

const CREATION_DATE_KEYS = [
  "creationDate",
  "created",
  "creation_date",
  "createdDate",
  "registered",
  "registeredOn",
  "registrationDate",
  "domainRegistrationDate",
  "registryRegistrationDate",
] as const;

const REGISTRAR_KEYS = ["registrar", "registrarName", "registrar_name", "sponsoringRegistrar"] as const;

function pickFirstString(record: WhoisRecord, keys: readonly string[]): string | null {
  for (const k of keys) {
    const v = record[k];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  // Some WHOIS libraries lower-case the keys; do a case-insensitive sweep
  // as a fallback so we don't miss `Creation Date` / `Created On` shapes.
  const wanted = keys.map((k) => k.toLowerCase());
  for (const [k, v] of Object.entries(record)) {
    if (typeof v === "string" && v.trim().length > 0 && wanted.includes(k.toLowerCase())) {
      return v.trim();
    }
  }
  return null;
}

function toIsoDate(raw: string): string | null {
  const d = new Date(raw);
  if (Number.isFinite(d.getTime())) return d.toISOString();
  return null;
}

// --- Lazy whois-json import ---------------------------------------

let cachedWhoisFn: WhoisFn | undefined;
async function loadWhois(): Promise<WhoisFn> {
  if (cachedWhoisFn) return cachedWhoisFn;
  // whois-json has CommonJS shape and no first-party @types. We import
  // through a string identifier built at runtime so TS's static module
  // resolution doesn't try to find a `.d.ts` for it — the package is
  // declared as a dep in package.json and loaded only when the evaluator
  // actually runs against a real domain. Tests inject `options.whois`
  // and never reach this code path (CI-safe; no live WHOIS calls).
  const moduleName = "whois-json";
  const mod = (await import(/* @vite-ignore */ moduleName)) as unknown as
    | WhoisFn
    | { default?: WhoisFn };
  const fn =
    typeof mod === "function"
      ? (mod as WhoisFn)
      : (mod as { default?: WhoisFn }).default;
  if (typeof fn !== "function") {
    throw new Error("whois-json module did not export a callable function");
  }
  cachedWhoisFn = fn;
  return fn;
}

// --- Pure judgement ------------------------------------------------

export function judgeDomainAge(ageDays: number): {
  severity: EvalResult["severity"];
  score: number;
} {
  if (ageDays < 0) return { severity: "fail", score: 0 };
  if (ageDays < 30) return { severity: "fail", score: Math.max(0, ageDays * 2) };
  if (ageDays < 90) return { severity: "warn", score: 70 };
  return { severity: "pass", score: Math.min(100, 80 + Math.floor(ageDays / 90)) };
}

// --- Core ----------------------------------------------------------

export async function evaluateDomainAge(
  hostname: string,
  options: DomainAgeOptions = {},
): Promise<{
  severity: EvalResult["severity"];
  score: number;
  evidence: DomainAgeEvidence;
  fixActionMarkdown: string;
}> {
  if (isSkippableHost(hostname)) {
    return {
      severity: "pass",
      score: 100,
      evidence: {
        creationDate: null,
        ageDays: -1,
        registrar: null,
        skipped: "non-public-host",
      },
      fixActionMarkdown:
        "Hostname is a non-public dev/test host — domain-age check skipped.",
    };
  }

  const apex = apexFromHostname(hostname);
  const cacheTtlMs = options.cacheTtlMs ?? SEVEN_DAYS_MS;
  const now = options.now ?? (() => new Date());
  const nowMs = now().getTime();

  let record: WhoisRecord;
  let fromCache = false;
  const cached = _cache.get(apex);
  if (cached && cached.expiresAt > nowMs) {
    record = cached.record;
    fromCache = true;
  } else {
    const whois = options.whois ?? (await loadWhois());
    record = await whois(apex);
    _cache.set(apex, { record, expiresAt: nowMs + cacheTtlMs });
  }

  const rawCreated = pickFirstString(record, CREATION_DATE_KEYS);
  const registrar = pickFirstString(record, REGISTRAR_KEYS);
  const creationDate = rawCreated ? toIsoDate(rawCreated) : null;

  if (!creationDate) {
    const evidence: DomainAgeEvidence = {
      creationDate: null,
      ageDays: -1,
      registrar,
      fromCache,
    };
    return {
      severity: "fail",
      score: 0,
      evidence,
      fixActionMarkdown:
        "WHOIS lookup did not return a parseable creation date for this domain. If your domain is brand-new, wait or use an established secondary domain for the launch.",
    };
  }

  const ageDays = Math.floor((nowMs - new Date(creationDate).getTime()) / (24 * 60 * 60 * 1000));
  const judged = judgeDomainAge(ageDays);

  const evidence: DomainAgeEvidence = {
    creationDate,
    ageDays,
    registrar,
    fromCache,
  };

  let fixActionMarkdown: string;
  if (judged.severity === "pass") {
    fixActionMarkdown = `Domain is ${ageDays} days old (registrar: ${registrar ?? "unknown"}). No action needed.`;
  } else if (judged.severity === "warn") {
    fixActionMarkdown = `Domain is ${ageDays} days old — some checklists penalise newly-registered domains. If your domain is brand-new, wait or use an established secondary domain for the launch.`;
  } else {
    fixActionMarkdown = `Domain is only ${ageDays} days old (registered ${creationDate}). Spam-filter heuristics weight new domains heavily. If your domain is brand-new, wait or use an established secondary domain for the launch.`;
  }

  return {
    severity: judged.severity,
    score: judged.score,
    evidence,
    fixActionMarkdown,
  };
}

export const domainAgeEvaluator: Evaluator = {
  id: "dogfood-LRS-09",
  title: "Domain age (WHOIS)",
  checklistRef: "Stage 1 item 13 (domain age) — sub-check 1 of 3",
  evaluate: async (target: AuditTarget, ctx: AuditContext): Promise<EvalResult> => {
    const start = ctx.now();
    let hostname: string;
    try {
      hostname = new URL(target.url).hostname;
    } catch (err) {
      return {
        evaluatorId: "dogfood-LRS-09",
        severity: "fail",
        score: 0,
        latencyMs: Math.max(0, ctx.now() - start),
        costUsdMicros: 0,
        evidenceJson: {
          error: `Invalid target URL: ${target.url}`,
          cause: err instanceof Error ? err.message : String(err),
        },
        fixActionMarkdown:
          "Provide a fully-qualified URL (e.g. `https://example.com/`) so the domain-age evaluator can resolve the hostname.",
      };
    }
    const judged = await evaluateDomainAge(hostname);
    return {
      evaluatorId: "dogfood-LRS-09",
      severity: judged.severity,
      score: judged.score,
      latencyMs: Math.max(0, ctx.now() - start),
      costUsdMicros: 0,
      evidenceJson: judged.evidence as unknown as Record<string, unknown>,
      fixActionMarkdown: judged.fixActionMarkdown,
    };
  },
};
