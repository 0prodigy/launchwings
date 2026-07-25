import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateBuildPlatform,
  detectedPlatformFixAction,
  buildPlatformEvaluator,
  BUILD_PLATFORM_EVALUATOR_ID,
} from "../../evaluators/build-platform";
import type { AuditContext } from "../../types";

// Tests for the evaluator wrapper. The detection logic itself has its own
// pure-function test suite under `__tests__/detect/build-platform.test.ts`;
// here we exercise the runner-facing surface (severity/score/evidence/
// fixActionMarkdown shape, fetchHtml integration) and assert the
// fix_action_markdown copy passes the public copy-review gate.

function ctxWithHtml(html: string, finalUrl: string): AuditContext {
  return {
    fetchHtml: async () => ({ html, finalUrl, status: 200 }),
    runId: "test-run",
    now: () => 0,
  };
}

describe("evaluateBuildPlatform — pure orchestration", () => {
  it("returns severity=pass and score=100 on a strong subdomain match", () => {
    const result = evaluateBuildPlatform({
      url: "https://my-app.lovable.app/",
      html: "<html><head></head><body></body></html>",
    });
    expect(result.severity).toBe("pass");
    expect(result.score).toBe(100);
    expect(result.evidence.platform).toBe("lovable");
    expect(result.evidence.confidence).toBe(100);
    expect(result.fixActionMarkdown).toMatch(/built on Lovable/);
  });

  it("returns severity=pass with empty fix-action on a no-match", () => {
    const result = evaluateBuildPlatform({
      url: "https://example.com/",
      html: '<html><head><meta name="generator" content="Hugo"></head></html>',
    });
    expect(result.severity).toBe("pass");
    expect(result.score).toBe(0);
    expect(result.evidence.platform).toBeNull();
    expect(result.fixActionMarkdown).toBe("");
  });

  it("scales the meta-generator hit to score=85 (0.85 × 100)", () => {
    const result = evaluateBuildPlatform({
      url: "https://example.com/",
      html: '<html><head><meta name="generator" content="Lovable"></head></html>',
    });
    expect(result.score).toBe(85);
    expect(result.evidence.platform).toBe("lovable");
  });

  it("scales an asset-URL-only signal to score=70", () => {
    const result = evaluateBuildPlatform({
      url: "https://example.com/",
      html: '<html><head><script src="https://lovable.dev/runtime.js"></script></head></html>',
    });
    expect(result.score).toBe(70);
  });

  it("scales a header-only signal to score=95", () => {
    const result = evaluateBuildPlatform({
      url: "https://example.com/",
      headers: new Headers({ "x-powered-by": "Replit" }),
    });
    expect(result.score).toBe(95);
    expect(result.evidence.platform).toBe("replit");
  });

  it("stacks multiple weak signals up to score=95", () => {
    const result = evaluateBuildPlatform({
      url: "https://example.com/",
      html:
        '<html><head><meta name="generator" content="Lovable">' +
        '<script src="https://lovable.dev/r.js"></script></head></html>',
    });
    expect(result.score).toBe(95);
  });
});

describe("buildPlatformEvaluator — runner integration", () => {
  it("uses ctx.fetchHtml + records evidence on the EvalResult", async () => {
    const ctx = ctxWithHtml(
      '<!doctype html><html data-build-platform="lovable"></html>',
      "https://example.com/",
    );
    const result = await buildPlatformEvaluator.evaluate(
      { url: "https://example.com/" },
      ctx,
    );
    expect(result.evaluatorId).toBe(BUILD_PLATFORM_EVALUATOR_ID);
    expect(result.severity).toBe("pass");
    expect(result.evidenceJson.platform).toBe("lovable");
  });

  it("returns score=0 + null platform on a clean site", async () => {
    const ctx = ctxWithHtml(
      "<!doctype html><html><head></head><body><p>Hello</p></body></html>",
      "https://example.com/",
    );
    const result = await buildPlatformEvaluator.evaluate(
      { url: "https://example.com/" },
      ctx,
    );
    expect(result.severity).toBe("pass");
    expect(result.score).toBe(0);
    expect(result.evidenceJson.platform).toBeNull();
    expect(result.fixActionMarkdown).toBe("");
  });
});

describe("detectedPlatformFixAction — copy-review compliance", () => {
  // The fix_action_markdown surfaces in /audit results. Per
  // apps/web/scripts/copy-review.config.json we must NOT include any
  // internal-strategy vocabulary ("north star", "wedge", "icp", "tam",
  // "arr", "burn rate", etc.). This assertion is the gate that catches
  // a future copy edit that drifts.
  const DENY_TERMS = [
    /\bnorth\s+star\b/i,
    /\bnorth-star\b/i,
    /\bthe\s+wedge\b/i,
    /\bwedge\s+boundary\b/i,
    /\banti-icp\b/i,
    /\bicp\b/i,
    /\btam\b/i,
    /\barr\b/i,
    /\bburn\s+rate\b/i,
    /\binvestor\s+deck\b/i,
    /\bpre[-_ ]?mortem\b/i,
    /\badr-\d+\b/i,
    /\bdogfood-lrs-\d+\b/i,
    /\bmvp\+/i,
  ];

  it.each([
    ["lovable" as const],
    ["bolt" as const],
    ["v0" as const],
    ["replit" as const],
    ["cursor" as const],
    ["paperclip" as const],
    ["pickaxe" as const],
  ])("%s fix-action contains no copy-review deny terms", (platform) => {
    const text = detectedPlatformFixAction(platform);
    for (const re of DENY_TERMS) {
      expect(text).not.toMatch(re);
    }
    expect(text.length).toBeGreaterThan(0);
  });

  it("matches the same deny patterns as the public copy-review config", () => {
    // Cross-check: load the actual config and confirm none of its deny
    // patterns hit our generated copy. This protects against a future
    // config edit adding a new deny pattern that would slip past us.
    const here = dirname(fileURLToPath(import.meta.url));
    const configPath = join(
      here,
      "..",
      "..",
      "..",
      "..",
      "..",
      "apps",
      "web",
      "scripts",
      "copy-review.config.json",
    );
    const config = JSON.parse(readFileSync(configPath, "utf8")) as {
      deny: Array<{ pattern: string; wholeWord?: boolean }>;
    };
    const platforms = [
      "lovable",
      "bolt",
      "v0",
      "replit",
      "cursor",
      "paperclip",
      "pickaxe",
    ] as const;
    for (const p of platforms) {
      const text = detectedPlatformFixAction(p);
      for (const rule of config.deny) {
        const body = rule.wholeWord ? `\\b(?:${rule.pattern})\\b` : `(?:${rule.pattern})`;
        const re = new RegExp(body, "i");
        expect(text, `pattern ${rule.pattern} hit on platform ${p}`).not.toMatch(re);
      }
    }
  });
});
