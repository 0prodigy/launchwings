// Build-Platform Integration PR1 — Level 1 detection.
//
// Per docs/architecture/BUILD_PLATFORM_INTEGRATIONS.md §"Level 1 — URL import"
// this is the cheapest, partnership-free integration: from the audit target's
// URL + already-fetched HTML (+ optional response headers / DNS), infer which
// AI build platform produced the site. ADR-0002 reaffirms Level 1 is in v1
// scope while explicitly excluding any deploy capability.
//
// Why a pure function (no I/O):
//   - The evaluator wrapper (`packages/lrs/src/evaluators/build-platform.ts`)
//     is the only consumer that does network work; it forwards already-fetched
//     HTML + optionally headers from `ctx.fetchHtml` into this function.
//   - Tests can exercise every detection rule with literal HTML strings; no
//     fetch mocking, no DNS stubbing, no fixtures on disk.
//
// Rule priority (first match with confidence ≥ 0.9 wins; otherwise we stack
// lower-confidence signals up to a 0.95 cap):
//
//   1. Subdomain match against `*.lovable.app`, `*.bolt.new`, `*.v0.app`,
//      `*.replit.app`, `*.paperclip.app`, `*.pickaxe.co`, etc. — confidence 1.0.
//   2. HTML <meta name="generator"> + `<!-- Built with X -->` comments
//      + `data-build-platform="..."` root attribute — confidence 0.85.
//   3. Asset URL hints — `<script src>` / `<link href>` pointing at a
//      platform's CDN — confidence 0.7.
//   4. Response headers — `x-powered-by` / `server` containing the platform
//      name — confidence 0.95.
//   5. Otherwise null. The evaluator scores `confidence × 100`; null
//      detections still pass (informational evaluator) with score 0.
//
// Design note on the platform vocabulary:
//   The detection vocabulary (this file) covers the seven launch-target
//   platforms BUILD_PLATFORM_INTEGRATIONS.md lists in priority order PLUS
//   the schema enum is a strict superset (adds tempolabs / softgen /
//   create-xyz) so ops can tag a row from a future detection rule without
//   shipping code. We cap detection at the seven primary partners on
//   purpose: detection signals for second-wave platforms haven't been
//   captured yet, and a false positive is worse than a missed tag.

/** All platforms we currently emit detections for. The schema enum
 *  (`buildPlatformId` in @launchwings/db) is a strict superset for future
 *  manual tagging — see schema.ts. */
export type BuildPlatformId =
  | "lovable"
  | "bolt"
  | "v0"
  | "replit"
  | "cursor"
  | "paperclip"
  | "pickaxe";

/** A single piece of evidence fed into the confidence calculation. The
 *  founder UI renders these as a per-platform "why we think this" list. */
export type BuildPlatformDetectionSignal = {
  kind: "subdomain" | "html-meta" | "header" | "asset-url" | "html-comment";
  /** The raw matched value (the subdomain, the meta content, the script src,
   *  etc.). Useful in logs and for the founder UI's "why" explainer. */
  value: string;
};

export type BuildPlatformDetection = {
  platform: BuildPlatformId | null;
  /** 0..1 — see file header for ladder. The evaluator stores this as
   *  `confidence × 100` in evidence_json (integer 0..100). */
  confidence: number;
  signals: BuildPlatformDetectionSignal[];
};

export type BuildPlatformDetectInput = {
  url: string;
  html?: string;
  /** Response headers from the HTML fetch. We accept both raw `Headers`
   *  and a plain object so callers (the evaluator wrapper, tests) can
   *  pass whichever shape they have. Header names are case-insensitive. */
  headers?: Headers | Record<string, string | string[] | undefined>;
  /** Optional DNS records (CNAME targets, etc.) — currently unused but
   *  reserved on the input type so PR2 can light up DNS-based detection
   *  (e.g. CNAME pointing at `cname.vercel-dns.com` followed by Replit's
   *  data API confirming an external custom domain) without a signature
   *  change. */
  dnsRecords?: string[];
};

// ---------------------------------------------------------------------------
// Subdomain rules
// ---------------------------------------------------------------------------

type SubdomainRule = {
  /** Suffix match against the URL's hostname (case-insensitive). The ".app"
   *  inclusion in each rule makes a bare "lovable.app" home page land on
   *  Lovable as well — that's intentional, we want the canonical-home
   *  detection to fire for the platform's own marketing site. */
  suffix: string;
  platform: BuildPlatformId;
};

const SUBDOMAIN_RULES: SubdomainRule[] = [
  { suffix: ".lovable.app", platform: "lovable" },
  { suffix: ".lovable.dev", platform: "lovable" },
  { suffix: ".bolt.new", platform: "bolt" },
  // StackBlitz hosts most Bolt one-shots; per the brief this is a heuristic,
  // not a guarantee — confidence still 1.0 on the subdomain match alone.
  { suffix: ".stackblitz.io", platform: "bolt" },
  { suffix: ".v0.app", platform: "v0" },
  { suffix: ".v0.dev", platform: "v0" },
  { suffix: ".replit.app", platform: "replit" },
  { suffix: ".replit.dev", platform: "replit" },
  { suffix: ".repl.co", platform: "replit" },
  { suffix: ".paperclip.app", platform: "paperclip" },
  { suffix: ".pickaxe.co", platform: "pickaxe" },
];

function matchSubdomain(hostname: string): { platform: BuildPlatformId; matched: string } | null {
  const lower = hostname.toLowerCase();
  for (const rule of SUBDOMAIN_RULES) {
    if (lower === rule.suffix.slice(1) || lower.endsWith(rule.suffix)) {
      return { platform: rule.platform, matched: lower };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// HTML hints (meta + comment + data-attribute)
// ---------------------------------------------------------------------------

/** Platform-name token → BuildPlatformId. Case-insensitive substring match
 *  used by both the meta-generator and HTML-comment scanners. The token
 *  must be specific enough not to collide with unrelated copy ("v0" alone
 *  is too short — we always require a context like "v0.app" or
 *  "Built with v0"). */
type HtmlTokenRule = {
  /** Regex evaluated case-insensitively. */
  pattern: RegExp;
  platform: BuildPlatformId;
};

const META_GENERATOR_RULES: HtmlTokenRule[] = [
  { pattern: /\blovable\b/i, platform: "lovable" },
  { pattern: /\bbolt(\.new)?\b/i, platform: "bolt" },
  { pattern: /\bv0(\.app|\.dev|\s+by\s+vercel)?\b/i, platform: "v0" },
  { pattern: /\breplit\b/i, platform: "replit" },
  { pattern: /\bcursor\b/i, platform: "cursor" },
  { pattern: /\bpaperclip\b/i, platform: "paperclip" },
  { pattern: /\bpickaxe\b/i, platform: "pickaxe" },
];

const HTML_COMMENT_RULES: HtmlTokenRule[] = [
  { pattern: /built\s+with\s+lovable/i, platform: "lovable" },
  { pattern: /built\s+with\s+bolt/i, platform: "bolt" },
  { pattern: /built\s+with\s+v0/i, platform: "v0" },
  { pattern: /built\s+(on|with)\s+replit/i, platform: "replit" },
  { pattern: /built\s+with\s+cursor/i, platform: "cursor" },
  { pattern: /built\s+with\s+paperclip/i, platform: "paperclip" },
  { pattern: /built\s+with\s+pickaxe/i, platform: "pickaxe" },
];

const DATA_ATTRIBUTE_RULES: HtmlTokenRule[] = [
  { pattern: /lovable/i, platform: "lovable" },
  { pattern: /bolt/i, platform: "bolt" },
  { pattern: /^v0$/i, platform: "v0" },
  { pattern: /replit/i, platform: "replit" },
  { pattern: /cursor/i, platform: "cursor" },
  { pattern: /paperclip/i, platform: "paperclip" },
  { pattern: /pickaxe/i, platform: "pickaxe" },
];

// Match the entire <meta ... name="generator" ...> tag (case-insensitive).
// We don't use a full HTML parser here because cheerio is a heavy dependency
// for what is fundamentally three regexes; if PR2 adds DOM-deep detection
// we'll move to cheerio at that point and keep the pure-function shape.
const META_GENERATOR_RE =
  /<meta\b[^>]*\bname\s*=\s*["']generator["'][^>]*\bcontent\s*=\s*["']([^"']*)["'][^>]*>/i;
// Also match the reverse attribute order — content="..." name="generator".
const META_GENERATOR_RE_REVERSED =
  /<meta\b[^>]*\bcontent\s*=\s*["']([^"']*)["'][^>]*\bname\s*=\s*["']generator["'][^>]*>/i;
// HTML comments — `<!-- ... -->`.
const HTML_COMMENT_RE = /<!--([\s\S]*?)-->/g;
// `data-build-platform="..."` attribute on any element. Lovable's newer
// scaffold sets this on <html>; we accept it on any element.
const DATA_BUILD_PLATFORM_RE = /\bdata-build-platform\s*=\s*["']([^"']+)["']/i;

function detectFromMetaGenerator(html: string): BuildPlatformDetectionSignal & { platform: BuildPlatformId } | null {
  const match = META_GENERATOR_RE.exec(html) ?? META_GENERATOR_RE_REVERSED.exec(html);
  if (!match) return null;
  const content = match[1] ?? "";
  for (const rule of META_GENERATOR_RULES) {
    if (rule.pattern.test(content)) {
      return { kind: "html-meta", value: content, platform: rule.platform };
    }
  }
  return null;
}

function detectFromHtmlComments(html: string): Array<BuildPlatformDetectionSignal & { platform: BuildPlatformId }> {
  const out: Array<BuildPlatformDetectionSignal & { platform: BuildPlatformId }> = [];
  HTML_COMMENT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HTML_COMMENT_RE.exec(html)) !== null) {
    const body = (m[1] ?? "").trim();
    if (!body) continue;
    for (const rule of HTML_COMMENT_RULES) {
      if (rule.pattern.test(body)) {
        out.push({ kind: "html-comment", value: body.slice(0, 200), platform: rule.platform });
        break;
      }
    }
  }
  return out;
}

function detectFromDataAttribute(html: string): BuildPlatformDetectionSignal & { platform: BuildPlatformId } | null {
  const match = DATA_BUILD_PLATFORM_RE.exec(html);
  if (!match) return null;
  const value = (match[1] ?? "").trim();
  for (const rule of DATA_ATTRIBUTE_RULES) {
    if (rule.pattern.test(value)) {
      return { kind: "html-meta", value: `data-build-platform="${value}"`, platform: rule.platform };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Asset URL hints
// ---------------------------------------------------------------------------

type AssetHostRule = {
  /** Substring match (case-insensitive) against script/link URLs. We use
   *  substring rather than hostname-suffix because some platforms host
   *  their CDN under paths (`lovable.dev/_assets/...`) on the apex name,
   *  not subdomains. */
  hostSubstring: string;
  platform: BuildPlatformId;
};

const ASSET_HOST_RULES: AssetHostRule[] = [
  { hostSubstring: "lovable.dev", platform: "lovable" },
  { hostSubstring: "lovable.app", platform: "lovable" },
  { hostSubstring: "bolt.new", platform: "bolt" },
  { hostSubstring: "stackblitz.io", platform: "bolt" },
  { hostSubstring: "v0.app", platform: "v0" },
  { hostSubstring: "v0.dev", platform: "v0" },
  { hostSubstring: "replit.app", platform: "replit" },
  { hostSubstring: "replit.com", platform: "replit" },
  { hostSubstring: "repl.co", platform: "replit" },
  { hostSubstring: "paperclip.app", platform: "paperclip" },
  { hostSubstring: "pickaxe.co", platform: "pickaxe" },
];

const SCRIPT_SRC_RE = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
const LINK_HREF_RE = /<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi;

function detectFromAssetUrls(html: string): Array<BuildPlatformDetectionSignal & { platform: BuildPlatformId }> {
  const out: Array<BuildPlatformDetectionSignal & { platform: BuildPlatformId }> = [];
  for (const re of [SCRIPT_SRC_RE, LINK_HREF_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const url = m[1] ?? "";
      const lower = url.toLowerCase();
      for (const rule of ASSET_HOST_RULES) {
        if (lower.includes(rule.hostSubstring)) {
          out.push({ kind: "asset-url", value: url, platform: rule.platform });
          break;
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Header hints
// ---------------------------------------------------------------------------

type HeaderRule = {
  /** Header name we read (case-insensitive, lowercase canonical). */
  name: string;
  /** Tokens (lowercased) we substring-match against the header value. */
  tokens: Array<{ token: string; platform: BuildPlatformId }>;
};

const HEADER_RULES: HeaderRule[] = [
  {
    name: "x-powered-by",
    tokens: [
      { token: "lovable", platform: "lovable" },
      { token: "bolt", platform: "bolt" },
      { token: "v0", platform: "v0" },
      { token: "replit", platform: "replit" },
      { token: "cursor", platform: "cursor" },
      { token: "paperclip", platform: "paperclip" },
      { token: "pickaxe", platform: "pickaxe" },
    ],
  },
  {
    name: "server",
    tokens: [
      { token: "lovable", platform: "lovable" },
      { token: "bolt", platform: "bolt" },
      { token: "replit", platform: "replit" },
      { token: "paperclip", platform: "paperclip" },
      { token: "pickaxe", platform: "pickaxe" },
    ],
  },
];

function readHeader(
  headers: Headers | Record<string, string | string[] | undefined>,
  name: string,
): string | null {
  if (typeof (headers as Headers).get === "function") {
    const v = (headers as Headers).get(name);
    return v ? v : null;
  }
  // Plain object — case-insensitive lookup.
  const obj = headers as Record<string, string | string[] | undefined>;
  for (const key of Object.keys(obj)) {
    if (key.toLowerCase() === name) {
      const v = obj[key];
      if (Array.isArray(v)) return v.join(", ");
      return v ?? null;
    }
  }
  return null;
}

function detectFromHeaders(
  headers: Headers | Record<string, string | string[] | undefined>,
): Array<BuildPlatformDetectionSignal & { platform: BuildPlatformId }> {
  const out: Array<BuildPlatformDetectionSignal & { platform: BuildPlatformId }> = [];
  for (const rule of HEADER_RULES) {
    const value = readHeader(headers, rule.name);
    if (!value) continue;
    const lower = value.toLowerCase();
    for (const { token, platform } of rule.tokens) {
      if (lower.includes(token)) {
        out.push({
          kind: "header",
          value: `${rule.name}: ${value}`,
          platform,
        });
        break;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Aggregation — combine signals into a single platform + confidence.
// ---------------------------------------------------------------------------

/** Confidence each signal kind contributes when seen alone. The aggregator
 *  picks the strongest signal for the dominant platform; multiple lower-
 *  confidence signals stack additively, capped at 0.95. */
const KIND_CONFIDENCE: Record<BuildPlatformDetectionSignal["kind"], number> = {
  subdomain: 1.0,
  header: 0.95,
  "html-meta": 0.85,
  "html-comment": 0.85,
  "asset-url": 0.7,
};

function aggregate(
  signals: Array<BuildPlatformDetectionSignal & { platform: BuildPlatformId }>,
): BuildPlatformDetection {
  if (signals.length === 0) {
    return { platform: null, confidence: 0, signals: [] };
  }

  // Group by platform and find the strongest signal per platform; the
  // platform with the highest peak signal wins. Ties broken by signal count.
  type Group = {
    platform: BuildPlatformId;
    peakConfidence: number;
    signals: BuildPlatformDetectionSignal[];
  };
  const groups = new Map<BuildPlatformId, Group>();
  for (const s of signals) {
    const peak = KIND_CONFIDENCE[s.kind];
    const existing = groups.get(s.platform);
    if (!existing) {
      groups.set(s.platform, {
        platform: s.platform,
        peakConfidence: peak,
        signals: [{ kind: s.kind, value: s.value }],
      });
    } else {
      existing.signals.push({ kind: s.kind, value: s.value });
      if (peak > existing.peakConfidence) existing.peakConfidence = peak;
    }
  }

  let winner: Group | null = null;
  for (const g of groups.values()) {
    if (
      !winner ||
      g.peakConfidence > winner.peakConfidence ||
      (g.peakConfidence === winner.peakConfidence && g.signals.length > winner.signals.length)
    ) {
      winner = g;
    }
  }
  if (!winner) return { platform: null, confidence: 0, signals: [] };

  // Stacking: start from the peak; each additional weaker signal adds half
  // its kind-confidence (cap 0.95). A subdomain match (1.0) already
  // satisfies the ≥0.9 first-hit-wins rule; stacking only matters when the
  // top signal is < 0.95.
  let confidence = winner.peakConfidence;
  if (confidence < 0.95) {
    const sorted = [...winner.signals].sort(
      (a, b) => KIND_CONFIDENCE[b.kind] - KIND_CONFIDENCE[a.kind],
    );
    for (let i = 1; i < sorted.length; i += 1) {
      const sig = sorted[i];
      if (!sig) continue;
      confidence = Math.min(0.95, confidence + KIND_CONFIDENCE[sig.kind] / 2);
    }
  } else {
    confidence = Math.min(1.0, confidence);
  }

  return {
    platform: winner.platform,
    confidence: Number(confidence.toFixed(4)),
    signals: winner.signals,
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function detectBuildPlatform(
  input: BuildPlatformDetectInput,
): BuildPlatformDetection {
  const signals: Array<BuildPlatformDetectionSignal & { platform: BuildPlatformId }> = [];

  // 1) Subdomain — derive hostname from the URL. If parsing fails we
  //    skip this rule rather than throw; the caller may have handed us a
  //    relative URL during a unit test.
  let hostname: string | null = null;
  try {
    hostname = new URL(input.url).hostname;
  } catch {
    hostname = null;
  }
  if (hostname) {
    const sub = matchSubdomain(hostname);
    if (sub) {
      signals.push({ kind: "subdomain", value: sub.matched, platform: sub.platform });
    }
  }

  // 2) Headers
  if (input.headers) {
    signals.push(...detectFromHeaders(input.headers));
  }

  // 3) HTML hints
  const html = input.html ?? "";
  if (html) {
    const meta = detectFromMetaGenerator(html);
    if (meta) signals.push(meta);
    const dataAttr = detectFromDataAttribute(html);
    if (dataAttr) signals.push(dataAttr);
    signals.push(...detectFromHtmlComments(html));
    signals.push(...detectFromAssetUrls(html));
  }

  // First-hit-wins rule: if any single signal is ≥0.9, short-circuit on
  // its platform. We still surface every matching signal in `signals`
  // (so the founder UI can show the corroboration), but the winning
  // platform is locked to the high-confidence signal's platform.
  const highConfidenceSignal = signals.find(
    (s) => KIND_CONFIDENCE[s.kind] >= 0.9,
  );
  if (highConfidenceSignal) {
    const same = signals.filter((s) => s.platform === highConfidenceSignal.platform);
    return aggregate(same);
  }

  return aggregate(signals);
}
