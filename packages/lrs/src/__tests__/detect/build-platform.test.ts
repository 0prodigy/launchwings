import { describe, expect, it } from "vitest";
import { detectBuildPlatform } from "../../detect/build-platform";

// Pure-function tests for the detection library. No fetch, no DOM, no DB —
// every input is a literal URL + HTML string.
//
// Coverage matrix (per Build-Platform Integration PR1 spec):
//   - subdomain hit (highest confidence)
//   - meta-generator hit
//   - HTML-comment hit
//   - data-build-platform attribute hit
//   - asset-URL hit
//   - response-header hit
//   - multi-signal stacking
//   - no-match → null + confidence 0
//   - first-hit-wins precedence (subdomain over weaker signals)

describe("detectBuildPlatform — subdomain rule", () => {
  it("matches *.lovable.app at confidence 1.0", () => {
    const result = detectBuildPlatform({
      url: "https://my-app.lovable.app/",
      html: "<html><head></head><body></body></html>",
    });
    expect(result.platform).toBe("lovable");
    expect(result.confidence).toBe(1);
    expect(result.signals[0]?.kind).toBe("subdomain");
    expect(result.signals[0]?.value).toBe("my-app.lovable.app");
  });

  it("matches *.bolt.new", () => {
    const result = detectBuildPlatform({ url: "https://thing.bolt.new/" });
    expect(result.platform).toBe("bolt");
    expect(result.confidence).toBe(1);
  });

  it("matches *.stackblitz.io as bolt heuristic", () => {
    const result = detectBuildPlatform({ url: "https://abc-123.stackblitz.io/" });
    expect(result.platform).toBe("bolt");
  });

  it("matches *.v0.app", () => {
    const result = detectBuildPlatform({ url: "https://demo.v0.app/" });
    expect(result.platform).toBe("v0");
  });

  it("matches *.replit.app", () => {
    const result = detectBuildPlatform({ url: "https://my-bot.replit.app/" });
    expect(result.platform).toBe("replit");
  });

  it("matches the legacy *.repl.co subdomain", () => {
    const result = detectBuildPlatform({ url: "https://hello.username.repl.co/" });
    expect(result.platform).toBe("replit");
  });

  it("matches *.paperclip.app", () => {
    const result = detectBuildPlatform({ url: "https://team.paperclip.app/" });
    expect(result.platform).toBe("paperclip");
  });

  it("matches *.pickaxe.co", () => {
    const result = detectBuildPlatform({ url: "https://my-tool.pickaxe.co/" });
    expect(result.platform).toBe("pickaxe");
  });
});

describe("detectBuildPlatform — HTML hints", () => {
  it("matches a meta generator tag (Lovable)", () => {
    const html =
      '<!doctype html><html><head><meta name="generator" content="Lovable v2.3"></head><body></body></html>';
    const result = detectBuildPlatform({ url: "https://example.com/", html });
    expect(result.platform).toBe("lovable");
    // 0.85 single-signal confidence.
    expect(result.confidence).toBe(0.85);
    expect(result.signals[0]?.kind).toBe("html-meta");
  });

  it("matches a meta generator tag with reversed attribute order", () => {
    const html =
      '<!doctype html><html><head><meta content="v0 by Vercel" name="generator"></head><body></body></html>';
    const result = detectBuildPlatform({ url: "https://example.com/", html });
    expect(result.platform).toBe("v0");
  });

  it("matches an HTML comment ('Built with Lovable')", () => {
    const html =
      "<!doctype html><html><head><!-- Built with Lovable --></head><body></body></html>";
    const result = detectBuildPlatform({ url: "https://example.com/", html });
    expect(result.platform).toBe("lovable");
    expect(result.signals[0]?.kind).toBe("html-comment");
  });

  it("matches the data-build-platform attribute on root element", () => {
    const html =
      '<!doctype html><html data-build-platform="lovable"><head></head><body></body></html>';
    const result = detectBuildPlatform({ url: "https://example.com/", html });
    expect(result.platform).toBe("lovable");
  });
});

describe("detectBuildPlatform — asset URL hints", () => {
  it("matches a script src on lovable.dev (lower-confidence single signal)", () => {
    const html =
      '<!doctype html><html><head><script src="https://lovable.dev/assets/runtime.js"></script></head><body></body></html>';
    const result = detectBuildPlatform({ url: "https://example.com/", html });
    expect(result.platform).toBe("lovable");
    // Asset-URL alone is the weakest signal — 0.7 single confidence.
    expect(result.confidence).toBe(0.7);
    expect(result.signals[0]?.kind).toBe("asset-url");
  });

  it("matches a link href on v0.dev", () => {
    const html =
      '<!doctype html><html><head><link rel="stylesheet" href="https://v0.dev/styles/app.css"></head><body></body></html>';
    const result = detectBuildPlatform({ url: "https://example.com/", html });
    expect(result.platform).toBe("v0");
  });
});

describe("detectBuildPlatform — header hints", () => {
  it("matches x-powered-by: Lovable from a Headers instance", () => {
    const headers = new Headers({ "x-powered-by": "Lovable/3.1" });
    const result = detectBuildPlatform({ url: "https://example.com/", headers });
    expect(result.platform).toBe("lovable");
    // header signals are 0.95 alone.
    expect(result.confidence).toBe(0.95);
    expect(result.signals[0]?.kind).toBe("header");
  });

  it("matches server: Replit from a plain object", () => {
    const result = detectBuildPlatform({
      url: "https://example.com/",
      headers: { Server: "Replit-Edge/1.0" },
    });
    expect(result.platform).toBe("replit");
  });
});

describe("detectBuildPlatform — multi-signal stacking", () => {
  it("stacks meta + asset-url to push confidence above 0.85 (cap 0.95)", () => {
    const html =
      '<!doctype html><html><head><meta name="generator" content="Lovable">' +
      '<script src="https://lovable.dev/runtime.js"></script></head><body></body></html>';
    const result = detectBuildPlatform({ url: "https://example.com/", html });
    expect(result.platform).toBe("lovable");
    // peak (0.85) + 0.7/2 = 1.20 → capped at 0.95.
    expect(result.confidence).toBe(0.95);
    expect(result.signals.length).toBeGreaterThanOrEqual(2);
  });

  it("returns confidence 1.0 when subdomain stacks with weaker signals (first-hit-wins)", () => {
    const html =
      '<!doctype html><html><head><meta name="generator" content="Lovable"></head><body></body></html>';
    const result = detectBuildPlatform({ url: "https://my-app.lovable.app/", html });
    // Subdomain triggers first-hit-wins on Lovable; we still surface the
    // meta tag as corroborating evidence in the signals[].
    expect(result.platform).toBe("lovable");
    expect(result.confidence).toBe(1);
    expect(result.signals.some((s) => s.kind === "subdomain")).toBe(true);
    expect(result.signals.some((s) => s.kind === "html-meta")).toBe(true);
  });
});

describe("detectBuildPlatform — no match", () => {
  it("returns null platform / 0 confidence on a clean unrelated site", () => {
    const html =
      '<!doctype html><html><head><meta name="generator" content="Hugo 0.130.0"></head><body><p>Hello</p></body></html>';
    const result = detectBuildPlatform({ url: "https://example.com/", html });
    expect(result.platform).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.signals).toEqual([]);
  });

  it("tolerates an invalid URL (returns null instead of throwing)", () => {
    const result = detectBuildPlatform({ url: "not-a-url", html: "" });
    expect(result.platform).toBeNull();
    expect(result.confidence).toBe(0);
  });
});
