#!/usr/bin/env node
// WEB-001 — verify every asset URL referenced in prerendered HTML actually
// ships either as a Next 15 file-convention route or as a public file.
// Catches the bug class from learnings.md #12 (og:image / favicon 404s).
//
// Usage: run AFTER `next build`, with cwd = apps/web. Exits non-zero on miss.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, posix } from "node:path";

const APP_ROOT = process.cwd();
const NEXT_APP = join(APP_ROOT, ".next", "server", "app");
const PUBLIC_DIR = join(APP_ROOT, "public");
const PROD_HOST = "https://launchwings.com";

if (!existsSync(NEXT_APP)) {
  console.error(`[check-shipped-assets] missing ${NEXT_APP} — run \`next build\` first.`);
  process.exit(2);
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const htmlFiles = walk(NEXT_APP).filter((p) => p.endsWith(".html"));
if (htmlFiles.length === 0) {
  console.error("[check-shipped-assets] no prerendered .html files under .next/server/app");
  process.exit(2);
}

// Patterns that capture URLs we care about. Keep narrow — broad matches cause
// false positives on RSC payload strings.
const SELECTORS = [
  /<meta\s+[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/gi,
  /<meta\s+[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/gi,
  /<link\s+[^>]*rel=["'][^"']*icon[^"']*["'][^>]*href=["']([^"']+)["']/gi,
  /<link\s+[^>]*rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["']/gi,
  /<link\s+[^>]*rel=["']manifest["'][^>]*href=["']([^"']+)["']/gi,
  /<link\s+[^>]*rel=["']preload["'][^>]*as=["']image["'][^>]*href=["']([^"']+)["']/gi,
];

const findings = []; // { file, url }
for (const file of htmlFiles) {
  const html = readFileSync(file, "utf8");
  for (const re of SELECTORS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(html)) !== null) {
      findings.push({ file, url: m[1] });
    }
  }
}

if (findings.length === 0) {
  console.log("[check-shipped-assets] no asset URLs found in prerendered HTML — nothing to verify.");
  process.exit(0);
}

// Strip query/hash, drop production host, keep cross-origin URLs out of scope.
function normalize(url) {
  if (url.startsWith(PROD_HOST)) url = url.slice(PROD_HOST.length);
  if (/^https?:\/\//i.test(url)) return null; // third-party, skip
  url = url.split("?")[0].split("#")[0];
  if (!url.startsWith("/")) url = "/" + url;
  return url;
}

// A path is satisfied if any of these resolve:
//   - apps/web/public<path>                              (static asset)
//   - .next/server/app<path>/route.js                    (Next 15 route handler, e.g. /opengraph-image)
//   - .next/server/app<path>.html                        (prerendered page)
//   - .next/server/app<path>/page.js                     (server-rendered page bundle)
function isSatisfied(rel) {
  const candidates = [
    join(PUBLIC_DIR, rel),
    join(NEXT_APP, rel + ".html"),
    join(NEXT_APP, rel, "route.js"),
    join(NEXT_APP, rel, "page.js"),
  ];
  return candidates.some((c) => existsSync(c));
}

const seen = new Set();
const misses = [];
for (const f of findings) {
  const rel = normalize(f.url);
  if (rel === null) continue; // third-party
  const key = rel;
  if (seen.has(key)) continue;
  seen.add(key);
  if (!isSatisfied(rel)) misses.push({ ...f, normalizedUrl: rel });
}

if (misses.length > 0) {
  console.error("[check-shipped-assets] FAIL — these asset URLs are referenced in shipped HTML but no matching public file or Next route ships:\n");
  for (const m of misses) {
    console.error(`  ${m.normalizedUrl}`);
    console.error(`    referenced from ${posix.relative(APP_ROOT, m.file)}`);
    console.error(`    raw: ${m.url}`);
  }
  console.error(`\n${misses.length} broken asset reference(s). See docs/tickets/web-001-build-time-link-availability.md.`);
  process.exit(1);
}

console.log(`[check-shipped-assets] OK — ${seen.size} unique asset URL(s) in shipped HTML, all resolved.`);
