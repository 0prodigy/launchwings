import { describe, expect, it, vi } from "vitest";
import {
  analyticsBeaconStaticEvaluator,
  detectPlaceholders,
  detectProviders,
  extractScriptsFromHtml,
  shouldScanScript,
} from "../../evaluators/analytics-beacon-static";
import type { AuditContext } from "../../types";

// Pure-function + evaluator tests for the static-analysis variant of
// dogfood-LRS-11. Network is fully mocked: ctx.fetchHtml is a stub and
// vi.stubGlobal("fetch", ...) handles per-script GETs.
//
// The cases mirror the ticket-defined verdict ladder:
//   1. inline PostHog snippet present                         → pass
//   2. external posthog.com SDK URL with body sig             → pass
//   3. SDK present but `phc_REPLACE_ME` placeholder            → warn
//   4. GA4 + GTM both detected on the same page               → pass (both)
//   5. zero <script> tags                                     → warn-skipped
//   6. SDK script src present but every fetch returns 5xx     → warn-inconclusive

function makeCtx(opts: {
  html: string;
  finalUrl?: string;
}): AuditContext {
  return {
    fetchHtml: async () => ({
      html: opts.html,
      finalUrl: opts.finalUrl ?? "https://example.com/",
      status: 200,
    }),
    runId: "00000000-0000-0000-0000-000000000000",
    now: () => 0,
  };
}

describe("extractScriptsFromHtml", () => {
  it("collects external + inline scripts and resolves relative srcs", () => {
    const html = `
      <html><head>
        <script src="/_next/static/chunks/main-abc.js"></script>
        <script src="https://us-assets.i.posthog.com/static/array.js"></script>
        <script>window.__inlineFlag__=true;</script>
      </head><body></body></html>
    `;
    const out = extractScriptsFromHtml(html, "https://example.com/");
    expect(out.totalScriptTags).toBe(3);
    expect(out.externalScripts).toEqual([
      "https://example.com/_next/static/chunks/main-abc.js",
      "https://us-assets.i.posthog.com/static/array.js",
    ]);
    expect(out.inlineScripts).toHaveLength(1);
    expect(out.inlineScripts[0]).toContain("__inlineFlag__");
  });

  it("ignores data:, blob:, and javascript: pseudo-protocol srcs", () => {
    const html = `
      <html><body>
        <script src="data:application/javascript,alert(1)"></script>
        <script src="blob:https://example.com/abc"></script>
        <script src="javascript:void(0)"></script>
      </body></html>
    `;
    const out = extractScriptsFromHtml(html, "https://example.com/");
    expect(out.totalScriptTags).toBe(3);
    expect(out.externalScripts).toEqual([]);
    expect(out.inlineScripts).toEqual([]);
  });

  it("returns totalScriptTags=0 when there are no <script> tags", () => {
    const out = extractScriptsFromHtml(
      "<html><body><h1>hi</h1></body></html>",
      "https://example.com/",
    );
    expect(out.totalScriptTags).toBe(0);
  });
});

describe("shouldScanScript", () => {
  it("scans same-origin scripts", () => {
    expect(
      shouldScanScript("https://example.com/static/main.js", "https://example.com/"),
    ).toEqual({ scan: true, reason: "same-origin" });
  });

  it("scans known analytics-CDN hosts", () => {
    expect(
      shouldScanScript(
        "https://us-assets.i.posthog.com/static/array.js",
        "https://example.com/",
      ),
    ).toEqual({ scan: true, reason: "analytics-cdn" });
    expect(
      shouldScanScript(
        "https://www.googletagmanager.com/gtag/js?id=G-ABC",
        "https://example.com/",
      ),
    ).toEqual({ scan: true, reason: "analytics-cdn" });
  });

  it("skips unrelated third-party CDNs", () => {
    expect(
      shouldScanScript("https://cdn.example.org/lib.js", "https://example.com/"),
    ).toBeNull();
  });

  it("returns null for malformed URLs", () => {
    expect(shouldScanScript("not-a-url", "https://example.com/")).toBeNull();
  });
});

describe("detectProviders", () => {
  it("detects PostHog via posthog.init(", () => {
    expect(detectProviders("posthog.init('phc_abc',{api_host:'x'})"))
      .toEqual(["posthog"]);
  });

  it("detects multiple providers in the same body", () => {
    const body = `
      gtag('config','G-ABC');
      window.dataLayer=window.dataLayer||[];
      dataLayer.push({event:'pageview'});
    `;
    const found = detectProviders(body);
    expect(found).toContain("ga4");
    expect(found).toContain("gtm");
  });

  it("returns empty array when no signature matches", () => {
    expect(detectProviders("(function(){console.log('hello');})();")).toEqual([]);
  });
});

describe("detectPlaceholders", () => {
  it("flags the canonical PostHog REPLACE_ME marker", () => {
    expect(detectPlaceholders("posthog.init('phc_REPLACE_ME')"))
      .toContain("phc_REPLACE_ME");
  });

  it("flags GA placeholder ids", () => {
    expect(detectPlaceholders("gtag('config','G-XXXXXX')"))
      .toContain("G-XXXXXX");
  });

  it("returns empty array on a real-looking config", () => {
    expect(detectPlaceholders("posthog.init('phc_abc123def456')")).toEqual([]);
  });
});

describe("analyticsBeaconStaticEvaluator", () => {
  it("passes when an inline PostHog snippet is present (no fetch needed)", async () => {
    // Inline scripts are scanned in-place — no fetch should be called.
    const fetchMock = vi.fn(async () => new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const html = `
        <html><head>
          <script>
            !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){posthog.init('phc_abc123',{api_host:'https://us.i.posthog.com'})})}();
          </script>
        </head><body></body></html>
      `;
      const result = await analyticsBeaconStaticEvaluator.evaluate(
        { url: "https://example.com/", fetchedHtml: html },
        makeCtx({ html, finalUrl: "https://example.com/" }),
      );
      expect(result.severity).toBe("pass");
      expect(result.score).toBe(100);
      expect(result.evaluatorId).toBe("dogfood-LRS-11");
      const ev = result.evidenceJson as Record<string, unknown>;
      expect(ev.providersDetected).toEqual(["posthog"]);
      expect(ev.scriptsScanned).toBe(0);
      expect(ev.suspectPlaceholders).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("passes when an external posthog.com SDK URL is fetched and contains the signature", async () => {
    const posthogBody = `!function(){var t={LIB_VERSION:"1.150"};window.__POSTHOG_LOADED__=!0;var e=function(){this.init=function(){}};e.prototype.init=function(){};window.posthog=new e;}();`;
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("posthog.com")) {
        return new Response(posthogBody, {
          status: 200,
          headers: { "content-type": "application/javascript" },
        });
      }
      return new Response("", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const html = `
        <html><head>
          <script src="https://us-assets.i.posthog.com/static/array.js"></script>
        </head><body></body></html>
      `;
      const result = await analyticsBeaconStaticEvaluator.evaluate(
        { url: "https://example.com/", fetchedHtml: html },
        makeCtx({ html, finalUrl: "https://example.com/" }),
      );
      expect(result.severity).toBe("pass");
      const ev = result.evidenceJson as Record<string, unknown>;
      expect(ev.providersDetected).toEqual(["posthog"]);
      expect(ev.scriptsScanned).toBe(1);
      expect(typeof ev.totalBytesScanned).toBe("number");
      expect(ev.totalBytesScanned as number).toBeGreaterThan(0);
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("warns when the SDK is present but `phc_REPLACE_ME` placeholder appears", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const html = `
        <html><head>
          <script>
            posthog.init('phc_REPLACE_ME', { api_host: 'https://app.posthog.com' });
          </script>
        </head><body></body></html>
      `;
      const result = await analyticsBeaconStaticEvaluator.evaluate(
        { url: "https://example.com/", fetchedHtml: html },
        makeCtx({ html, finalUrl: "https://example.com/" }),
      );
      expect(result.severity).toBe("warn");
      expect(result.score).toBe(60);
      const ev = result.evidenceJson as Record<string, unknown>;
      expect(ev.providersDetected).toEqual(["posthog"]);
      expect(ev.suspectPlaceholders).toContain("phc_REPLACE_ME");
      expect(result.fixActionMarkdown).toMatch(/misconfigured|placeholder/i);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("passes and records both providers when GA4 + GTM are present", async () => {
    // GA4 + GTM both ship via googletagmanager.com — same script src, two
    // signatures. We expect both to land in providersDetected.
    const gtagBody = `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-ABCDEF1234');
    `;
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes("googletagmanager.com")) {
        return new Response(gtagBody, {
          status: 200,
          headers: { "content-type": "application/javascript" },
        });
      }
      return new Response("", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const html = `
        <html><head>
          <script async src="https://www.googletagmanager.com/gtag/js?id=G-ABCDEF1234"></script>
          <script>
            // GTM bootstrap reference inline so the gtm pattern hits even
            // if the gtag/js body alone wouldn't have matched gtm.js.
            (function(w,d,s,l,i){
              w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});
              var f=d.getElementsByTagName(s)[0],j=d.createElement(s);
              j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i;
              f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','GTM-XYZ123');
          </script>
        </head><body></body></html>
      `;
      const result = await analyticsBeaconStaticEvaluator.evaluate(
        { url: "https://example.com/", fetchedHtml: html },
        makeCtx({ html, finalUrl: "https://example.com/" }),
      );
      expect(result.severity).toBe("pass");
      const ev = result.evidenceJson as Record<string, unknown>;
      const providers = ev.providersDetected as string[];
      expect(providers).toContain("ga4");
      expect(providers).toContain("gtm");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("warn-skips when the HTML has no <script> tags at all", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const html = `<html><head><title>placeholder</title></head><body><h1>Coming soon</h1></body></html>`;
      const result = await analyticsBeaconStaticEvaluator.evaluate(
        { url: "https://example.com/", fetchedHtml: html },
        makeCtx({ html, finalUrl: "https://example.com/" }),
      );
      expect(result.severity).toBe("warn");
      const ev = result.evidenceJson as Record<string, unknown>;
      expect(ev.skipped).toBe("no_scripts");
      expect(ev.scriptsScanned).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("conservatively warns when every script GET returns 5xx", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const html = `
        <html><head>
          <script src="https://us-assets.i.posthog.com/static/array.js"></script>
          <script src="https://example.com/_next/static/chunks/main.js"></script>
        </head><body></body></html>
      `;
      const result = await analyticsBeaconStaticEvaluator.evaluate(
        { url: "https://example.com/", fetchedHtml: html },
        makeCtx({ html, finalUrl: "https://example.com/" }),
      );
      expect(result.severity).toBe("warn");
      const ev = result.evidenceJson as Record<string, unknown>;
      expect(ev.providersDetected).toEqual([]);
      expect(ev.inconclusive).toBe("all_fetches_failed");
      expect(ev.scriptsScanned).toBe(2);
      const scripts = ev.scripts as Array<{ status: number | null }>;
      expect(scripts.every((s) => s.status === 503)).toBe(true);
      expect(result.fixActionMarkdown).toMatch(/could not verify|conservative/i);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("fails when scripts are present but no analytics SDK signature is found", async () => {
    const fetchMock = vi.fn(async () =>
      new Response("(function(){console.log('hello world');})();", {
        status: 200,
        headers: { "content-type": "application/javascript" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    try {
      const html = `
        <html><head>
          <script src="https://example.com/_next/static/chunks/main.js"></script>
        </head><body></body></html>
      `;
      const result = await analyticsBeaconStaticEvaluator.evaluate(
        { url: "https://example.com/", fetchedHtml: html },
        makeCtx({ html, finalUrl: "https://example.com/" }),
      );
      expect(result.severity).toBe("fail");
      expect(result.score).toBe(0);
      const ev = result.evidenceJson as Record<string, unknown>;
      expect(ev.providersDetected).toEqual([]);
      expect(ev.scriptsScanned).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
