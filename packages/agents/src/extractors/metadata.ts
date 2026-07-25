// ONB-01 — pure-function field extractors over a homepage HTML string.
//
// We follow the same lightweight regex approach as
// `packages/lrs/src/detect/build-platform.ts` rather than pulling cheerio:
// these are the five fields the URL-importer needs (title, meta description,
// hero headline, primary CTA, framework hints) and full DOM parsing is
// overkill for them. ONB-04 reuses these.
//
// Returns `string | null` for single-value extractors (or `string[]` for
// framework hints) so the caller can persist null verbatim into
// products.metadata without an empty-string special case.

const TITLE_RE = /<title\b[^>]*>([\s\S]*?)<\/title>/i;
const META_DESC_RE_NAME =
  /<meta\b[^>]*\bname\s*=\s*["']description["'][^>]*\bcontent\s*=\s*["']([^"']*)["'][^>]*>/i;
const META_DESC_RE_NAME_REVERSED =
  /<meta\b[^>]*\bcontent\s*=\s*["']([^"']*)["'][^>]*\bname\s*=\s*["']description["'][^>]*>/i;
// OG description as a fallback — a non-trivial fraction of marketing pages
// only set <meta property="og:description"> and skip <meta name="description">.
const META_OG_DESC_RE =
  /<meta\b[^>]*\bproperty\s*=\s*["']og:description["'][^>]*\bcontent\s*=\s*["']([^"']*)["'][^>]*>/i;
const META_OG_DESC_RE_REVERSED =
  /<meta\b[^>]*\bcontent\s*=\s*["']([^"']*)["'][^>]*\bproperty\s*=\s*["']og:description["'][^>]*>/i;
const META_GENERATOR_RE =
  /<meta\b[^>]*\bname\s*=\s*["']generator["'][^>]*\bcontent\s*=\s*["']([^"']*)["'][^>]*>/i;
const META_GENERATOR_RE_REVERSED =
  /<meta\b[^>]*\bcontent\s*=\s*["']([^"']*)["'][^>]*\bname\s*=\s*["']generator["'][^>]*>/i;
const H1_RE = /<h1\b[^>]*>([\s\S]*?)<\/h1>/gi;
const SCRIPT_SRC_RE = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
// Capture both <a ...>text</a> and <button ...>text</button>. We cap
// inner-content length at 500 chars to bound regex backtracking on
// pathological inputs.
const ANCHOR_OR_BUTTON_RE =
  /<(a|button)\b[^>]*>([\s\S]{0,500}?)<\/\1>/gi;
const CTA_TEXT_RE = /^(get|start|try|sign[- ]?up|join|launch|book|buy)\b/i;

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, "");
}

function decodeBasicEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function clean(s: string | null | undefined): string | null {
  if (!s) return null;
  const trimmed = decodeBasicEntities(stripTags(s)).replace(/\s+/g, " ").trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function extractTitle(html: string): string | null {
  if (!html) return null;
  const m = TITLE_RE.exec(html);
  return clean(m?.[1]);
}

export function extractMetaDescription(html: string): string | null {
  if (!html) return null;
  const m =
    META_DESC_RE_NAME.exec(html) ??
    META_DESC_RE_NAME_REVERSED.exec(html) ??
    META_OG_DESC_RE.exec(html) ??
    META_OG_DESC_RE_REVERSED.exec(html);
  return clean(m?.[1]);
}

export function extractHeroHeadline(html: string): string | null {
  if (!html) return null;
  H1_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = H1_RE.exec(html)) !== null) {
    const text = clean(m[1]);
    if (text) return text;
  }
  return null;
}

export function extractPrimaryCta(html: string): string | null {
  if (!html) return null;
  ANCHOR_OR_BUTTON_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ANCHOR_OR_BUTTON_RE.exec(html)) !== null) {
    const text = clean(m[2]);
    if (text && CTA_TEXT_RE.test(text)) return text;
  }
  return null;
}

type FrameworkHintRule = { token: RegExp; label: string };

// Substring/regex tokens we look for in <script src> URLs and the
// <meta name="generator"> content. Order matters only insofar as we
// dedupe: we return labels in detection order.
const FRAMEWORK_RULES: FrameworkHintRule[] = [
  { token: /\bnext\b|_next\//i, label: "next.js" },
  { token: /\bnuxt\b|_nuxt\//i, label: "nuxt" },
  { token: /\bastro\b/i, label: "astro" },
  { token: /\bsveltekit\b|\bsvelte\b/i, label: "svelte" },
  { token: /\bremix\b/i, label: "remix" },
  { token: /\bvue(?:\.js|\.runtime)?\b/i, label: "vue" },
  { token: /\breact(?:-dom)?\b/i, label: "react" },
];

export function extractFrameworkHints(html: string): string[] {
  if (!html) return [];
  const found = new Set<string>();
  // Pull <meta name="generator"> content first — Astro/Nuxt/etc set this.
  const genMatch =
    META_GENERATOR_RE.exec(html) ?? META_GENERATOR_RE_REVERSED.exec(html);
  const generator = genMatch?.[1] ?? "";
  for (const rule of FRAMEWORK_RULES) {
    if (rule.token.test(generator)) found.add(rule.label);
  }
  // Then walk <script src> URLs — most React/Vue SPAs leak their framework
  // through bundle paths even when no generator meta is set.
  SCRIPT_SRC_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SCRIPT_SRC_RE.exec(html)) !== null) {
    const src = m[1] ?? "";
    for (const rule of FRAMEWORK_RULES) {
      if (rule.token.test(src)) found.add(rule.label);
    }
  }
  return [...found];
}
