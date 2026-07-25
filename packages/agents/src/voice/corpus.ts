// F2 PR1 — voice corpus loader.
//
// The founder's already-published build-in-public posts under
// `docs/dogfood/posts/*.md` ARE the voice corpus the social-draft agent
// matches against. Each post is a markdown file with YAML frontmatter:
//
//   ---
//   channel: x | linkedin | reddit | bluesky | threads
//   status: draft | ready | posted
//   ---
//
//   <body verbatim>
//
// We load by walking the directory at runtime (NOT bundling) so a freshly
// authored post seeds the next agent run without a deploy. Path resolution:
//
//   1. `process.cwd()/docs/dogfood/posts` — works when the agent runs from
//      the repo root (Trigger.dev dev, vitest from monorepo root, scripts).
//   2. Fallback relative to this file's location (../../../../docs/...) —
//      handles cases where cwd is the package root or wherever Trigger.dev's
//      worker decides to chdir to.
//
// Frontmatter parsing: hand-rolled, no `gray-matter` dep. The format is
// trivial and adding a transitive package for it is overkill. Bad/missing
// frontmatter → the post is skipped (logged), not the loader crashing.

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type SocialChannelLiteral = "x" | "linkedin" | "reddit" | "bluesky" | "threads";

export interface VoiceSample {
  /** Filename slug, e.g. "2026-05-07-wedge-live-on-homepage". */
  slug: string;
  /** Channel parsed from frontmatter. */
  channel: SocialChannelLiteral;
  /** Body text with frontmatter stripped. */
  body: string;
}

export interface LoadVoiceCorpusOpts {
  /**
   * Cap on number of samples returned. Defaults to 5 most recent
   * (sorted by slug DESC, since slugs are date-prefixed).
   */
  sampleCap?: number;
  /** If set, only return samples whose channel matches. */
  channel?: SocialChannelLiteral;
  /** Override the corpus directory. Tests use this; production should not. */
  corpusDir?: string;
}

const DEFAULT_SAMPLE_CAP = 5;
const VALID_CHANNELS = new Set<SocialChannelLiteral>([
  "x",
  "linkedin",
  "reddit",
  "bluesky",
  "threads",
]);

function logJson(line: Record<string, unknown>): void {
  console.log(JSON.stringify({ source: "agents-voice-corpus", ...line }));
}

/**
 * Locate `docs/dogfood/posts/`. Returns null if neither candidate exists.
 *
 * Exported for tests so they can verify the resolution order without mocking
 * the filesystem.
 */
export function resolveCorpusDir(override?: string): string | null {
  if (override) {
    return existsSync(override) ? override : null;
  }
  const cwdCandidate = resolve(process.cwd(), "docs/dogfood/posts");
  if (existsSync(cwdCandidate) && statSync(cwdCandidate).isDirectory()) {
    return cwdCandidate;
  }
  // Fallback: resolve relative to this source file. We're at
  // packages/agents/src/voice/corpus.ts → up 4 = repo root.
  const here = dirname(fileURLToPath(import.meta.url));
  const fileCandidate = resolve(here, "..", "..", "..", "..", "docs", "dogfood", "posts");
  if (existsSync(fileCandidate) && statSync(fileCandidate).isDirectory()) {
    return fileCandidate;
  }
  return null;
}

/**
 * Parse a single markdown-with-frontmatter file. Returns null if the file
 * doesn't have a parseable YAML-ish frontmatter block or lacks a valid
 * `channel:` field. Errors are logged, not thrown — a malformed corpus file
 * shouldn't break draft generation for the rest.
 */
export function parseVoiceFile(slug: string, raw: string): VoiceSample | null {
  // Frontmatter starts with `---\n` and ends with `\n---\n`.
  // We don't use a real YAML parser — frontmatter shape is trivial.
  if (!raw.startsWith("---")) {
    logJson({ level: "warn", message: "voice_file_no_frontmatter", slug });
    return null;
  }
  // Find the closing fence after the opening one.
  const afterOpen = raw.indexOf("\n", 3);
  if (afterOpen < 0) {
    logJson({ level: "warn", message: "voice_file_truncated_frontmatter", slug });
    return null;
  }
  const closeIdx = raw.indexOf("\n---", afterOpen);
  if (closeIdx < 0) {
    logJson({ level: "warn", message: "voice_file_no_frontmatter_close", slug });
    return null;
  }
  const fmBlock = raw.slice(afterOpen + 1, closeIdx);
  const bodyStart = raw.indexOf("\n", closeIdx + 4);
  const body = (bodyStart < 0 ? "" : raw.slice(bodyStart + 1)).trim();

  const fm: Record<string, string> = {};
  for (const line of fmBlock.split("\n")) {
    const m = /^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*?)\s*$/.exec(line);
    if (m && m[1]) {
      fm[m[1]] = (m[2] ?? "").replace(/^["']|["']$/g, "");
    }
  }
  const channel = fm["channel"];
  if (!channel || !VALID_CHANNELS.has(channel as SocialChannelLiteral)) {
    logJson({ level: "warn", message: "voice_file_missing_channel", slug, found: channel });
    return null;
  }
  if (!body) {
    logJson({ level: "warn", message: "voice_file_empty_body", slug });
    return null;
  }
  return {
    slug,
    channel: channel as SocialChannelLiteral,
    body,
  };
}

/**
 * Load up to `sampleCap` voice samples, optionally filtered by channel.
 *
 * Sort order: slug DESC. Slugs are date-prefixed (`YYYY-MM-DD-...`), so
 * lexicographic DESC = most recent first. If the corpus dir doesn't exist
 * we return [] — the agent's system prompt has fallback voice instructions
 * that work without samples (just less personalised).
 */
export function loadVoiceCorpus(opts: LoadVoiceCorpusOpts = {}): VoiceSample[] {
  const cap = opts.sampleCap ?? DEFAULT_SAMPLE_CAP;
  const dir = resolveCorpusDir(opts.corpusDir);
  if (!dir) {
    logJson({ level: "warn", message: "voice_corpus_dir_missing" });
    return [];
  }

  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .sort()
    .reverse();

  const out: VoiceSample[] = [];
  for (const file of files) {
    if (out.length >= cap) break;
    const slug = file.replace(/\.md$/, "");
    let raw: string;
    try {
      raw = readFileSync(join(dir, file), "utf-8");
    } catch (err) {
      logJson({
        level: "warn",
        message: "voice_file_read_failed",
        slug,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    const sample = parseVoiceFile(slug, raw);
    if (!sample) continue;
    if (opts.channel && sample.channel !== opts.channel) continue;
    out.push(sample);
  }
  return out;
}
