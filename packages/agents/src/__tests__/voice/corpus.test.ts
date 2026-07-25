import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadVoiceCorpus,
  parseVoiceFile,
  resolveCorpusDir,
} from "../../voice/corpus";

// F2 PR1 voice corpus tests.
//
// Three cases:
//   1. happy-path read of `docs/dogfood/posts/` — uses the actual repo corpus
//      via the file-relative fallback resolver. Asserts ≥ 1 sample loads with
//      the expected channel + non-empty body.
//   2. missing-frontmatter handling — synthetic temp dir with one valid file
//      and two malformed (no frontmatter, missing channel). Asserts ONLY the
//      valid one comes back.
//   3. fallback when no posts exist — temp dir empty → loader returns [].

describe("loadVoiceCorpus — happy path against docs/dogfood/posts", () => {
  it("loads at least one X sample with non-empty body via the repo corpus", () => {
    // No corpusDir override — exercises the resolveCorpusDir fallback chain.
    // (cwd resolution may or may not hit; the file-relative fallback always
    //  resolves to the repo root regardless of where vitest runs from.)
    const samples = loadVoiceCorpus({ channel: "x" });
    expect(samples.length).toBeGreaterThan(0);
    for (const s of samples) {
      expect(s.channel).toBe("x");
      expect(s.body.length).toBeGreaterThan(40);
      expect(s.slug).toMatch(/^\d{4}-\d{2}-\d{2}-/);
    }
  });
});

describe("loadVoiceCorpus — malformed and edge cases", () => {
  it("skips files without frontmatter and without a channel field", () => {
    const dir = mkdtempSync(join(tmpdir(), "voice-corpus-"));
    try {
      // 1. valid
      writeFileSync(
        join(dir, "2026-05-01-good.md"),
        "---\nchannel: x\nstatus: draft\n---\n\nshipped today.\n",
        "utf-8",
      );
      // 2. no frontmatter
      writeFileSync(
        join(dir, "2026-05-02-no-fm.md"),
        "this file has no frontmatter at all.\n",
        "utf-8",
      );
      // 3. frontmatter but missing channel
      writeFileSync(
        join(dir, "2026-05-03-no-channel.md"),
        "---\nstatus: draft\n---\n\nbody.\n",
        "utf-8",
      );

      const samples = loadVoiceCorpus({ corpusDir: dir });
      expect(samples).toHaveLength(1);
      expect(samples[0]?.slug).toBe("2026-05-01-good");
      expect(samples[0]?.channel).toBe("x");
      expect(samples[0]?.body).toContain("shipped today");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns [] when the corpus dir is empty", () => {
    const dir = mkdtempSync(join(tmpdir(), "voice-corpus-empty-"));
    try {
      const samples = loadVoiceCorpus({ corpusDir: dir });
      expect(samples).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns [] when the corpus dir does not exist", () => {
    const samples = loadVoiceCorpus({ corpusDir: "/nonexistent/path-xyz-987" });
    expect(samples).toEqual([]);
  });
});

describe("parseVoiceFile", () => {
  it("rejects an unknown channel", () => {
    const out = parseVoiceFile(
      "x",
      "---\nchannel: tiktok\n---\n\nbody\n",
    );
    expect(out).toBeNull();
  });

  it("strips quoted frontmatter values", () => {
    const out = parseVoiceFile(
      "y",
      "---\nchannel: \"linkedin\"\n---\n\nbody\n",
    );
    expect(out?.channel).toBe("linkedin");
  });
});

describe("resolveCorpusDir", () => {
  it("returns null for a nonexistent override", () => {
    expect(resolveCorpusDir("/no/such/path")).toBeNull();
  });

  it("uses the override if it exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "voice-corpus-override-"));
    try {
      mkdirSync(dir, { recursive: true });
      expect(resolveCorpusDir(dir)).toBe(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
