#!/usr/bin/env node
// copy-review — static scanner that catches internal-strategy / investor-deck
// language leaking onto customer-facing pages (apps/web/app/**, components/**).
// Triggered by the founder-feedback class: the /about page shipped with a
// "North Star" section quoting the internal metric verbatim. We need a gate
// that catches this class of leak before it ships.
//
// Config: apps/web/scripts/copy-review.config.json (deny patterns + allow-list).
// Usage:  cwd = apps/web. Exits 1 if any deny match remains, 0 if clean.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

const APP_ROOT = process.cwd();
const CONFIG_PATH = join(APP_ROOT, "scripts", "copy-review.config.json");

if (!existsSync(CONFIG_PATH)) {
  console.error(JSON.stringify({ level: "error", scanner: "copy-review", msg: "missing config", path: CONFIG_PATH }));
  process.exit(2);
}

const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
const allowInlineToken = String(config.allowInline ?? "copy-review: ignore");
const allowedFiles = Array.isArray(config.allowedFiles) ? config.allowedFiles : [];
const deny = Array.isArray(config.deny) ? config.deny : [];

// Roots to scan — customer-facing surfaces only. API routes and internal docs
// are explicitly out of scope; they ARE allowed to use internal vocabulary.
const SCAN_ROOTS = [
  { root: join(APP_ROOT, "app"), exts: [".tsx", ".mdx", ".md"] },
  { root: join(APP_ROOT, "components"), exts: [".tsx"] },
];

// Hard-skip directories regardless of allowedFiles config — these are server
// code, build artefacts, or vendored deps that can't possibly ship to users.
const HARD_SKIP_DIRS = new Set(["node_modules", ".next", "dist", "api"]);

// Glob-ish matcher: supports trailing /** and leading **/ — enough for the
// initial allowedFiles patterns ("**/__tests__/**", "**/node_modules/**").
// Pure regex, no minimatch dep.
function compileGlob(glob) {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\/?/g, "::DSTAR::")
    .replace(/\*/g, "[^/]*")
    .replace(/::DSTAR::/g, "(?:.*/)?");
  return new RegExp("^" + escaped + "$");
}

const allowedFileRegexes = allowedFiles.map(compileGlob);

function isAllowedFile(relPath) {
  // Normalise to forward slashes for cross-platform glob match.
  const p = relPath.split(sep).join("/");
  return allowedFileRegexes.some((re) => re.test(p));
}

function walk(dir, exts, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (HARD_SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) {
      walk(full, exts, out);
    } else if (exts.some((ext) => name.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

// Compile each deny rule into a global, multi-line, case-insensitive regex.
// `wholeWord: true` adds \b boundaries (used for short tokens like ICP, TAM, ARR
// where substring matches would false-positive on real words).
function compileRule(rule) {
  const raw = rule.pattern;
  const body = rule.wholeWord ? `\\b(?:${raw})\\b` : `(?:${raw})`;
  return {
    rule,
    re: new RegExp(body, "gim"),
  };
}

const compiledRules = deny.map(compileRule);

function lineColFromIndex(text, idx) {
  let line = 1;
  let lastNl = -1;
  for (let i = 0; i < idx; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      lastNl = i;
    }
  }
  return { line, col: idx - lastNl };
}

function lineHasInlineAllow(text, idx) {
  // Find the line containing idx.
  let start = idx;
  while (start > 0 && text.charCodeAt(start - 1) !== 10) start--;
  let end = idx;
  while (end < text.length && text.charCodeAt(end) !== 10) end++;
  const line = text.slice(start, end);
  return line.includes(allowInlineToken);
}

const findings = []; // { file, line, col, matched, reason, pattern }
const filesScanned = [];

for (const { root, exts } of SCAN_ROOTS) {
  const files = walk(root, exts);
  for (const file of files) {
    const rel = relative(APP_ROOT, file);
    if (isAllowedFile(rel)) continue;
    filesScanned.push(rel);
    const text = readFileSync(file, "utf8");
    for (const { rule, re } of compiledRules) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        const idx = m.index;
        if (lineHasInlineAllow(text, idx)) continue;
        const { line, col } = lineColFromIndex(text, idx);
        findings.push({
          file: rel,
          line,
          col,
          matched: m[0],
          reason: rule.reason,
          pattern: rule.pattern,
        });
        // Avoid zero-width infinite loops.
        if (m[0].length === 0) re.lastIndex++;
      }
    }
  }
}

// Single-line JSON structured logs for each finding (matches house style).
for (const f of findings) {
  console.log(JSON.stringify({ level: "error", scanner: "copy-review", ...f }));
}

// Summary counts by reason.
const byReason = {};
for (const f of findings) byReason[f.reason] = (byReason[f.reason] ?? 0) + 1;

console.log(
  JSON.stringify({
    level: findings.length > 0 ? "error" : "info",
    scanner: "copy-review",
    msg: "summary",
    filesScanned: filesScanned.length,
    findings: findings.length,
    byReason,
  }),
);

process.exit(findings.length > 0 ? 1 : 0);
