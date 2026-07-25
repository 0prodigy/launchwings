import { describe, expect, it, vi } from "vitest";
import {
  faviconEvaluator,
  parseFaviconLinks,
} from "../../evaluators/favicon-presence";
import type { AuditContext } from "../../types";

// favicon evaluator tests. We stub global fetch so we can pretend each
// probe URL returned a specific status + content-type without touching
// the network. The HTML side is parsed in-memory; we do not exercise
// ctx.fetchHtml since target.fetchedHtml is provided.

function makeCtx(html: string, finalUrl = "https://example.com/"): AuditContext {
  return {
    fetchHtml: async () => ({ html, finalUrl, status: 200 }),
    runId: "r",
    now: () => 0,
  };
}

/**
 * Build a fetch mock that returns per-URL responses based on a routing
 * map. URLs not in the map default to 404 + text/html (the audit-log #12
 * default — Next 404 HTML for an asset that doesn't exist).
 */
function routedFetch(
  routes: Record<string, { status: number; contentType: string }>,
): typeof fetch {
  return vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    const route =
      routes[url] ??
      ({ status: 404, contentType: "text/html; charset=utf-8" } as const);
    return new Response(null, {
      status: route.status,
      headers: { "content-type": route.contentType },
    });
  }) as unknown as typeof fetch;
}

describe("parseFaviconLinks", () => {
  it("extracts <link rel=icon> hrefs and resolves them against the page URL", () => {
    const html = `
      <html><head>
        <link rel="icon" href="/custom-favicon.png" sizes="32x32" />
        <link rel="apple-touch-icon" href="/icons/apple.png" />
        <link rel="shortcut icon" href="/legacy.ico" />
        <link rel="stylesheet" href="/app.css" />
      </head></html>
    `;
    const out = parseFaviconLinks(html, "https://example.com/page");
    const urls = out.map((l) => l.url).sort();
    expect(urls).toEqual([
      "https://example.com/custom-favicon.png",
      "https://example.com/icons/apple.png",
      "https://example.com/legacy.ico",
    ]);
    const sized = out.find((l) => l.url.endsWith("custom-favicon.png"));
    expect(sized?.sizes).toBe("32x32");
  });

  it("ignores rel values without an icon token", () => {
    const html = `
      <html><head>
        <link rel="canonical" href="/" />
        <link rel="manifest" href="/manifest.json" />
      </head></html>
    `;
    expect(parseFaviconLinks(html, "https://example.com/")).toEqual([]);
  });
});

describe("faviconEvaluator", () => {
  it("passes when /favicon.ico AND /apple-touch-icon.png both resolve", async () => {
    vi.stubGlobal(
      "fetch",
      routedFetch({
        "https://example.com/favicon.ico": {
          status: 200,
          contentType: "image/x-icon",
        },
        "https://example.com/apple-touch-icon.png": {
          status: 200,
          contentType: "image/png",
        },
        "https://example.com/icon.png": {
          status: 404,
          contentType: "text/html",
        },
      }),
    );
    try {
      const result = await faviconEvaluator.evaluate(
        { url: "https://example.com/", fetchedHtml: "<html><head></head></html>" },
        makeCtx("<html><head></head></html>"),
      );
      expect(result.severity).toBe("pass");
      expect(result.score).toBe(100);
      const ev = result.evidenceJson as Record<string, unknown>;
      expect(ev.hasFavicon).toBe(true);
      expect(ev.hasAppleTouch).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("warns when only /favicon.ico resolves (no apple-touch / icon.png)", async () => {
    vi.stubGlobal(
      "fetch",
      routedFetch({
        "https://example.com/favicon.ico": {
          status: 200,
          contentType: "image/x-icon",
        },
      }),
    );
    try {
      const result = await faviconEvaluator.evaluate(
        { url: "https://example.com/", fetchedHtml: "<html><head></head></html>" },
        makeCtx("<html><head></head></html>"),
      );
      expect(result.severity).toBe("warn");
      const ev = result.evidenceJson as Record<string, unknown>;
      expect(ev.hasFavicon).toBe(true);
      expect(ev.hasAppleTouch).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("fails when nothing resolves (the audit-log #12 baseline)", async () => {
    vi.stubGlobal("fetch", routedFetch({}));
    try {
      const result = await faviconEvaluator.evaluate(
        { url: "https://launchwings.com/", fetchedHtml: "<html><head></head></html>" },
        makeCtx("<html><head></head></html>", "https://launchwings.com/"),
      );
      expect(result.severity).toBe("fail");
      expect(result.score).toBe(0);
      const ev = result.evidenceJson as Record<string, unknown>;
      expect(ev.hasFavicon).toBe(false);
      expect(ev.hasAppleTouch).toBe(false);
      expect(ev.hasIconPng).toBe(false);
      const probes = ev.probes as Array<{ url: string; status: number | null }>;
      // 3 conventional probes, all 404
      expect(probes.length).toBeGreaterThanOrEqual(3);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("uses an explicit <link rel=icon> href when present, satisfying favicon", async () => {
    const html = `
      <html><head>
        <link rel="icon" href="/assets/favicon-v2.png" />
        <link rel="apple-touch-icon" href="/assets/apple.png" />
      </head></html>
    `;
    vi.stubGlobal(
      "fetch",
      routedFetch({
        "https://example.com/assets/favicon-v2.png": {
          status: 200,
          contentType: "image/png",
        },
        "https://example.com/assets/apple.png": {
          status: 200,
          contentType: "image/png",
        },
      }),
    );
    try {
      const result = await faviconEvaluator.evaluate(
        { url: "https://example.com/", fetchedHtml: html },
        makeCtx(html),
      );
      expect(result.severity).toBe("pass");
      const ev = result.evidenceJson as Record<string, unknown>;
      expect(ev.hasFavicon).toBe(true);
      expect(ev.hasAppleTouch).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
