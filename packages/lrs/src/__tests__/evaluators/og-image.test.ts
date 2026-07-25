import { describe, expect, it, vi } from "vitest";
import { ogImageEvaluator, parseOgImageFromHtml } from "../../evaluators/og-image";
import type { AuditContext } from "../../types";

// og-image evaluator covers three cases:
//  1. present-and-resolves — meta tag set, HEAD returns 200 image/png
//  2. present-but-404 — meta tag set, HEAD returns 404 + text/html (the
//     exact failure mode from docs/dogfood/LRS_AUDIT_LOG.md item 10)
//  3. missing-tag — no og:image meta in the HTML
//
// We stub fetch for both the HTML fetch (in case the evaluator calls it)
// and the og:image HEAD probe.

function htmlWithOgImage(href: string | null): string {
  const head = href
    ? `<meta property="og:image" content="${href}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">`
    : "";
  return `<!doctype html><html><head>${head}</head><body></body></html>`;
}

function makeCtx(opts: {
  html: string;
  finalUrl: string;
  status: number;
}): AuditContext {
  return {
    fetchHtml: async () => ({
      html: opts.html,
      finalUrl: opts.finalUrl,
      status: opts.status,
    }),
    runId: "00000000-0000-0000-0000-000000000000",
    now: () => 0,
  };
}

describe("parseOgImageFromHtml", () => {
  it("resolves a relative href against the page URL", () => {
    const out = parseOgImageFromHtml(
      htmlWithOgImage("/og.png"),
      "https://example.com/page",
    );
    expect(out.ogImageUrl).toBe("https://example.com/og.png");
    expect(out.resolvedFromTag).toBe("og:image");
    expect(out.declaredWidth).toBe(1200);
    expect(out.declaredHeight).toBe(630);
  });

  it("returns null when no og:image is present", () => {
    const out = parseOgImageFromHtml(htmlWithOgImage(null), "https://example.com/");
    expect(out.ogImageUrl).toBeNull();
  });
});

describe("ogImageEvaluator", () => {
  it("passes when og:image resolves (200 + image/*)", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(null, {
        status: 200,
        headers: { "content-type": "image/png", "content-length": "84211" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await ogImageEvaluator.evaluate(
        { url: "https://example.com/" },
        makeCtx({
          html: htmlWithOgImage("https://example.com/og.png"),
          finalUrl: "https://example.com/",
          status: 200,
        }),
      );
      expect(result.severity).toBe("pass");
      expect(result.score).toBe(100);
      const ev = result.evidenceJson as Record<string, unknown>;
      expect(ev.ogImageUrl).toBe("https://example.com/og.png");
      expect(ev.status).toBe(200);
      expect(ev.contentType).toBe("image/png");
      expect(ev.declaredWidth).toBe(1200);
      expect(ev.declaredHeight).toBe(630);
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("fails when og:image returns 404 with text/html (Next 404 page mode)", async () => {
    // Repro of the exact audit-log finding: HEAD / GET on the asset hits a
    // Next.js 404 route which returns the HTML body with status 404 and
    // content-type text/html. Either signal (status non-2xx OR non-image
    // content-type) should fail the evaluator.
    const fetchMock = vi.fn(async () =>
      new Response(null, {
        status: 404,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await ogImageEvaluator.evaluate(
        { url: "https://launchwings.com/" },
        makeCtx({
          html: htmlWithOgImage("https://launchwings.com/og-default.png"),
          finalUrl: "https://launchwings.com/",
          status: 200,
        }),
      );
      expect(result.severity).toBe("fail");
      expect(result.score).toBeLessThan(50);
      const ev = result.evidenceJson as Record<string, unknown>;
      expect(ev.status).toBe(404);
      expect(ev.contentType).toContain("text/html");
      expect(result.fixActionMarkdown).toMatch(/og-default\.png|image|404/i);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("fails when no og:image meta tag is present", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await ogImageEvaluator.evaluate(
        { url: "https://example.com/" },
        makeCtx({
          html: htmlWithOgImage(null),
          finalUrl: "https://example.com/",
          status: 200,
        }),
      );
      expect(result.severity).toBe("fail");
      expect(result.score).toBe(0);
      const ev = result.evidenceJson as Record<string, unknown>;
      expect(ev.ogImageUrl).toBeNull();
      // No HEAD probe should have been issued — there's nothing to probe.
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
