import dnsPromises from "node:dns/promises";
import {
  RetryableError,
  type AuditContext,
  type AuditTarget,
  type EvalResult,
  type Evaluator,
} from "../types";

// LRS-DNS-001 — DNS proxy posture check.
//
// Source spec: docs/dogfood/learnings.md #9 (and the freshly-filed
// docs/tickets/lrs-dns-001-proxy-posture.md companion). Founder hit
// Cloudflare Error 1016 on `www.launchwings.com` because the CNAME
// pointed at `cname.vercel-dns.com` was orange-clouded (proxied)
// instead of grey-clouded (DNS-only). Vercel already provides edge +
// SSL; double-edging via Cloudflare breaks SSL handshake.
//
// What this evaluator does:
//   1. Resolve the apex + the `www` subdomain via dns.promises.resolve4
//      and resolve6.
//   2. Resolve a small standard set of underscore-prefixed protocol
//      records (`_domainconnect`, `_dmarc`, `_acme-challenge`). These
//      are control-plane records — proxying them is always wrong.
//   3. Resolve the apex + www CNAME (when present) and check its target
//      against known SaaS-vendor patterns (Vercel / Netlify / Railway /
//      Fly / Render). If the CNAME target says "Vercel" but the IP
//      resolves to Cloudflare-edge ranges → orange-cloud-on-Vercel trap.
//
// Cloudflare-edge IP detection uses CIDR matching against the public
// edge ranges Cloudflare publishes
// (https://www.cloudflare.com/ips/). We embed a minimal set sufficient
// to catch the launchwings.com incident; full ranges live in the ticket
// for the founder-ops follow-up to backfill.
//
// Severity ladder per ticket spec:
//   pass    no problematic combinations
//   warn    one underscore-record on Cloudflare (e.g. an inherited
//           `_domainconnect` from a GoDaddy NS migration — annoying but
//           rarely user-visible)
//   fail    any vercel/netlify/railway/fly/render CNAME resolves through
//           a Cloudflare-edge IP (the actual 1016-trap)
//
// Mocking surface: `evaluateDnsProxyPosture(target, ctx, deps)` accepts
// a `DnsProbeDeps` object that lets tests inject fake `resolve4`,
// `resolve6`, `resolveCname` implementations without monkey-patching
// the global `dns` module.

// --- Cloudflare edge IP ranges (subset; see ticket for full list) ----
//   IPv4: 104.16.0.0/12, 104.21.0.0/16, 172.64.0.0/13, 172.67.0.0/16
//   IPv6: 2606:4700::/32

type Ipv4Cidr = { network: number; prefix: number };
type Ipv6Prefix = { hexPrefix: string }; // we only need /32 matches

const CLOUDFLARE_V4_RANGES: Ipv4Cidr[] = [
  { network: ipv4ToInt("104.16.0.0"), prefix: 12 },
  { network: ipv4ToInt("104.21.0.0"), prefix: 16 },
  { network: ipv4ToInt("172.64.0.0"), prefix: 13 },
  { network: ipv4ToInt("172.67.0.0"), prefix: 16 },
];

const CLOUDFLARE_V6_PREFIXES: Ipv6Prefix[] = [
  // Match `2606:4700:*` (a /32 — first two 16-bit groups).
  { hexPrefix: "2606:4700:" },
];

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p) || p < 0 || p > 255)) {
    return -1;
  }
  // Use unsigned-shift to avoid negative numbers from the high-order octet.
  return (
    ((parts[0] ?? 0) * 0x1000000 +
      (parts[1] ?? 0) * 0x10000 +
      (parts[2] ?? 0) * 0x100 +
      (parts[3] ?? 0)) >>>
    0
  );
}

function isCloudflareV4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  if (value < 0) return false;
  for (const range of CLOUDFLARE_V4_RANGES) {
    const mask = range.prefix === 0 ? 0 : (~0 << (32 - range.prefix)) >>> 0;
    if ((value & mask) === (range.network & mask)) return true;
  }
  return false;
}

function isCloudflareV6(ip: string): boolean {
  // Normalise: lower-case, strip zone id if present, no expansion needed
  // because we only compare a /32 hex prefix.
  const lower = ip.toLowerCase().split("%")[0] ?? "";
  return CLOUDFLARE_V6_PREFIXES.some((p) => lower.startsWith(p.hexPrefix));
}

export function isCloudflareIp(ip: string): boolean {
  return ip.includes(":") ? isCloudflareV6(ip) : isCloudflareV4(ip);
}

// --- Vendor CNAME-target patterns we recognise ----------------------

const VENDOR_CNAME_PATTERNS: Array<{ pattern: RegExp; vendor: string }> = [
  { pattern: /\.vercel-dns\.com\.?$/i, vendor: "vercel" },
  { pattern: /\.vercel\.app\.?$/i, vendor: "vercel" },
  { pattern: /\.netlify\.app\.?$/i, vendor: "netlify" },
  { pattern: /\.netlify\.com\.?$/i, vendor: "netlify" },
  { pattern: /\.railway\.app\.?$/i, vendor: "railway" },
  { pattern: /\.up\.railway\.app\.?$/i, vendor: "railway" },
  { pattern: /\.fly\.dev\.?$/i, vendor: "fly" },
  { pattern: /\.onrender\.com\.?$/i, vendor: "render" },
];

function matchVendor(cname: string): string | null {
  for (const { pattern, vendor } of VENDOR_CNAME_PATTERNS) {
    if (pattern.test(cname)) return vendor;
  }
  return null;
}

// --- Underscore-prefixed records to probe ---------------------------

const UNDERSCORE_RECORDS = [
  "_domainconnect",
  "_dmarc",
  "_acme-challenge",
] as const;

// --- Types ----------------------------------------------------------

export type DnsRecordEvidence = {
  /** The fully-qualified name we queried. */
  name: string;
  /** A | AAAA | CNAME. */
  type: "A" | "AAAA" | "CNAME";
  /** The literal value returned (IP address or CNAME target). */
  value: string;
  /** True iff `value` is a Cloudflare-edge IP per our CIDR set. */
  isCloudflareEdge: boolean;
  /** True iff this record is a problem per the ticket's rules. */
  isProblematic: boolean;
  /** Human-readable explanation; empty when isProblematic is false. */
  reason: string;
};

export type DnsProxyEvidence = {
  hostname: string;
  apex: string;
  records: DnsRecordEvidence[];
  /** Convenience aggregates for the founder UI. */
  vercelBehindCloudflare: number;
  underscoreRecordsOnCloudflare: number;
};

export type DnsProbeDeps = {
  resolve4?: (host: string) => Promise<string[]>;
  resolve6?: (host: string) => Promise<string[]>;
  resolveCname?: (host: string) => Promise<string[]>;
};

// --- Core ------------------------------------------------------------

function apexFromHostname(hostname: string): string {
  // Naive ETLD+1 — fine for `*.com`, `*.io`, `*.dev` and friends. For
  // multi-part TLDs (`co.uk`, `com.au`) this would over-strip; we accept
  // that limitation for PR2 and document it on the ticket. Most customers
  // are on single-label TLDs.
  if (hostname === "localhost") return hostname;
  const parts = hostname.split(".");
  if (parts.length <= 2) return hostname;
  return parts.slice(-2).join(".");
}

async function safeResolve4(host: string, fn: NonNullable<DnsProbeDeps["resolve4"]>): Promise<string[]> {
  try {
    return await fn(host);
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "ENOTFOUND" || code === "ENODATA") return [];
    throw new RetryableError(
      `dns.resolve4(${host}) failed: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
}

async function safeResolve6(host: string, fn: NonNullable<DnsProbeDeps["resolve6"]>): Promise<string[]> {
  try {
    return await fn(host);
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "ENOTFOUND" || code === "ENODATA") return [];
    throw new RetryableError(
      `dns.resolve6(${host}) failed: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
}

async function safeResolveCname(host: string, fn: NonNullable<DnsProbeDeps["resolveCname"]>): Promise<string[]> {
  try {
    return await fn(host);
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "ENOTFOUND" || code === "ENODATA") return [];
    // CNAME-on-A-only is the common case; treat any non-resolvable error
    // as "no CNAME" not as a hard failure.
    return [];
  }
}

/** Pure-ish: runs the DNS probes against `deps` and returns a verdict. */
export async function evaluateDnsProxyPosture(
  hostname: string,
  deps: DnsProbeDeps = {},
): Promise<{
  severity: EvalResult["severity"];
  score: number;
  evidence: DnsProxyEvidence;
  fixActionMarkdown: string;
}> {
  const resolve4 = deps.resolve4 ?? dnsPromises.resolve4;
  const resolve6 = deps.resolve6 ?? dnsPromises.resolve6;
  const resolveCname = deps.resolveCname ?? dnsPromises.resolveCname;
  const apex = apexFromHostname(hostname);
  const wwwHost = `www.${apex}`;
  const records: DnsRecordEvidence[] = [];

  // Apex + www: A + AAAA + CNAME.
  for (const host of [apex, wwwHost]) {
    const cnames = await safeResolveCname(host, resolveCname);
    let cnameVendor: string | null = null;
    for (const target of cnames) {
      const vendor = matchVendor(target);
      if (vendor) cnameVendor = vendor;
      records.push({
        name: host,
        type: "CNAME",
        value: target,
        isCloudflareEdge: false,
        isProblematic: false,
        reason: vendor ? `CNAME points at ${vendor}` : "",
      });
    }
    const v4 = await safeResolve4(host, resolve4);
    const v6 = await safeResolve6(host, resolve6);
    for (const ip of v4) {
      const cf = isCloudflareV4(ip);
      const problematic = cf && cnameVendor !== null;
      records.push({
        name: host,
        type: "A",
        value: ip,
        isCloudflareEdge: cf,
        isProblematic: problematic,
        reason: problematic
          ? `${cnameVendor} CNAME resolves through Cloudflare edge IP — orange-cloud is on, must be DNS-only`
          : "",
      });
    }
    for (const ip of v6) {
      const cf = isCloudflareV6(ip);
      const problematic = cf && cnameVendor !== null;
      records.push({
        name: host,
        type: "AAAA",
        value: ip,
        isCloudflareEdge: cf,
        isProblematic: problematic,
        reason: problematic
          ? `${cnameVendor} CNAME resolves through Cloudflare edge IP — orange-cloud is on, must be DNS-only`
          : "",
      });
    }
  }

  // Underscore-prefixed protocol records.
  for (const prefix of UNDERSCORE_RECORDS) {
    const fqdn = `${prefix}.${apex}`;
    const cnames = await safeResolveCname(fqdn, resolveCname);
    for (const target of cnames) {
      records.push({
        name: fqdn,
        type: "CNAME",
        value: target,
        isCloudflareEdge: false,
        isProblematic: false,
        reason: "",
      });
    }
    const v4 = await safeResolve4(fqdn, resolve4);
    const v6 = await safeResolve6(fqdn, resolve6);
    for (const ip of v4) {
      const cf = isCloudflareV4(ip);
      records.push({
        name: fqdn,
        type: "A",
        value: ip,
        isCloudflareEdge: cf,
        isProblematic: cf,
        reason: cf
          ? `Underscore-prefixed protocol record proxied through Cloudflare — proxy=on is wrong for ${prefix}`
          : "",
      });
    }
    for (const ip of v6) {
      const cf = isCloudflareV6(ip);
      records.push({
        name: fqdn,
        type: "AAAA",
        value: ip,
        isCloudflareEdge: cf,
        isProblematic: cf,
        reason: cf
          ? `Underscore-prefixed protocol record proxied through Cloudflare — proxy=on is wrong for ${prefix}`
          : "",
      });
    }
  }

  const vercelBehindCloudflare = records.filter(
    (r) => r.isProblematic && r.reason.startsWith("vercel"),
  ).length +
    records.filter(
      (r) =>
        r.isProblematic &&
        (r.reason.startsWith("netlify") ||
          r.reason.startsWith("railway") ||
          r.reason.startsWith("fly") ||
          r.reason.startsWith("render")),
    ).length;

  const underscoreRecordsOnCloudflare = records.filter(
    (r) => r.isProblematic && r.name.startsWith("_"),
  ).length;

  const evidence: DnsProxyEvidence = {
    hostname,
    apex,
    records,
    vercelBehindCloudflare,
    underscoreRecordsOnCloudflare,
  };

  const fixLink =
    "Fix in the Cloudflare DNS dashboard at `https://dash.cloudflare.com/?to=/:account/${apex}/dns/records` — toggle the offending records from orange-cloud (proxied) to grey-cloud (DNS only).";

  if (vercelBehindCloudflare > 0) {
    return {
      severity: "fail",
      score: 0,
      evidence,
      fixActionMarkdown: `Detected ${vercelBehindCloudflare} record${vercelBehindCloudflare === 1 ? "" : "s"} where a SaaS-vendor CNAME (Vercel/Netlify/Railway/Fly/Render) resolves through a Cloudflare edge IP — the orange-cloud-on-Vercel trap that causes Error 1016. ${fixLink.replace("${apex}", apex)}`,
    };
  }

  if (underscoreRecordsOnCloudflare > 0) {
    return {
      severity: "warn",
      score: 70,
      evidence,
      fixActionMarkdown: `Detected ${underscoreRecordsOnCloudflare} underscore-prefixed protocol record${underscoreRecordsOnCloudflare === 1 ? "" : "s"} proxied through Cloudflare. Underscore records (\`_domainconnect\`, \`_dmarc\`, \`_acme-challenge\`) are DNS protocol-discovery records meant to be queried directly. ${fixLink.replace("${apex}", apex)}`,
    };
  }

  return {
    severity: "pass",
    score: 100,
    evidence,
    fixActionMarkdown: "DNS proxy posture is clean — no Cloudflare orange-cloud on records that shouldn't be proxied.",
  };
}

export const dnsProxyPostureEvaluator: Evaluator = {
  id: "LRS-DNS-001",
  title: "DNS proxy posture (Cloudflare orange-cloud trap)",
  checklistRef: "docs/dogfood/learnings.md #9 + docs/tickets/lrs-dns-001-proxy-posture.md",
  evaluate: async (target: AuditTarget, ctx: AuditContext): Promise<EvalResult> => {
    const start = ctx.now();
    let hostname: string;
    try {
      hostname = new URL(target.url).hostname;
    } catch (err) {
      return {
        evaluatorId: "LRS-DNS-001",
        severity: "fail",
        score: 0,
        latencyMs: Math.max(0, ctx.now() - start),
        costUsdMicros: 0,
        evidenceJson: {
          error: `Invalid target URL: ${target.url}`,
          cause: err instanceof Error ? err.message : String(err),
        },
        fixActionMarkdown:
          "Provide a fully-qualified URL (e.g. `https://example.com/`) so the DNS proxy-posture evaluator can resolve the hostname.",
      };
    }
    const judged = await evaluateDnsProxyPosture(hostname);
    return {
      evaluatorId: "LRS-DNS-001",
      severity: judged.severity,
      score: judged.score,
      latencyMs: Math.max(0, ctx.now() - start),
      costUsdMicros: 0,
      evidenceJson: judged.evidence as unknown as Record<string, unknown>,
      fixActionMarkdown: judged.fixActionMarkdown,
    };
  },
};
