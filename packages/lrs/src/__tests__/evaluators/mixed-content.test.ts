import { describe, expect, it } from "vitest";
import {
  findMixedContent,
  judgeMixedContent,
  mixedContentEvaluator,
} from "../../evaluators/mixed-content";
import type { AuditContext } from "../../types";

// Pure-function tests for the mixed-content evaluator. No network — the
// evaluator parses HTML in-memory and the runner-injected ctx.fetchHtml
// is replaced with a stub.

function ctx(html: string): AuditContext {
  return {
    fetchHtml: async () => ({
      html,
      finalUrl: "https://example.com/",
      status: 200,
    }),
    runId: "00000000-0000-0000-0000-000000000000",
    now: () => 0,
  };
}

describe("findMixedContent", () => {
  it("returns no findings for an HTTPS-only page (pass case)", () => {
    const html = `
      <html><head>
        <link rel="stylesheet" href="https://cdn.example.com/app.css" />
        <script src="https://cdn.example.com/app.js"></script>
      </head>
      <body>
        <img src="https://cdn.example.com/hero.png" />
        <iframe src="https://www.youtube.com/embed/abc"></iframe>
      </body></html>
    `;
    expect(findMixedContent(html)).toEqual([]);
  });

  it("ignores relative, protocol-relative, data:, and blob: URLs", () => {
    const html = `
      <html><body>
        <img src="/local.png" />
        <img src="./also-local.png" />
        <img src="//cdn.example.com/proto-relative.png" />
        <img src="data:image/png;base64,iVBORw0K" />
        <img src="blob:https://example.com/abc-123" />
        <script src="//cdn.example.com/app.js"></script>
      </body></html>
    `;
    expect(findMixedContent(html)).toEqual([]);
  });

  it("flags every watched tag/attr that uses http://", () => {
    const html = `
      <html><head>
        <link rel="stylesheet" href="http://cdn.legacy.example.com/old.css" />
      </head>
      <body>
        <img src="http://images.legacy.example.com/hero.png" />
        <iframe src="http://embed.legacy.example.com/frame"></iframe>
        <video><source src="http://media.legacy.example.com/clip.mp4" /></video>
        <audio src="http://media.legacy.example.com/song.mp3"></audio>
      </body></html>
    `;
    const findings = findMixedContent(html);
    const tags = findings.map((f) => f.tag).sort();
    expect(tags).toEqual(["audio", "iframe", "img", "link", "source"]);
  });

  it("matches scheme prefix case-insensitively", () => {
    const html = `<html><body><img src="HTTP://CDN.EXAMPLE.COM/x.png" /></body></html>`;
    const findings = findMixedContent(html);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.url).toContain("HTTP://CDN.EXAMPLE.COM/x.png");
  });
});

describe("judgeMixedContent severity ladder", () => {
  it("pass on zero findings", () => {
    const out = judgeMixedContent([]);
    expect(out.severity).toBe("pass");
    expect(out.score).toBe(100);
  });

  it("warn on 1–2 non-script findings", () => {
    const out = judgeMixedContent([
      { tag: "img", attr: "src", url: "http://cdn/x.png" },
      { tag: "img", attr: "src", url: "http://cdn/y.png" },
    ]);
    expect(out.severity).toBe("warn");
    expect(out.evidence.totalCount).toBe(2);
    expect(out.evidence.scriptCount).toBe(0);
  });

  it("fail on >=3 findings even if none are scripts", () => {
    const out = judgeMixedContent([
      { tag: "img", attr: "src", url: "http://cdn/x.png" },
      { tag: "img", attr: "src", url: "http://cdn/y.png" },
      { tag: "iframe", attr: "src", url: "http://cdn/z" },
    ]);
    expect(out.severity).toBe("fail");
  });

  it("fails immediately on a single http:// <script>", () => {
    const out = judgeMixedContent([
      { tag: "script", attr: "src", url: "http://cdn.legacy/app.js" },
    ]);
    expect(out.severity).toBe("fail");
    expect(out.evidence.scriptCount).toBe(1);
  });
});

describe("mixedContentEvaluator", () => {
  it("returns a pass row with empty findings on a clean page", async () => {
    const html = `<html><body><img src="https://ok/x.png" /></body></html>`;
    const result = await mixedContentEvaluator.evaluate(
      { url: "https://example.com/" },
      ctx(html),
    );
    expect(result.severity).toBe("pass");
    expect(result.evaluatorId).toBe("dogfood-LRS-05");
    const ev = result.evidenceJson as Record<string, unknown>;
    expect(ev.totalCount).toBe(0);
  });

  it("uses target.fetchedHtml when provided (no fetchHtml call)", async () => {
    let called = 0;
    const html = `<html><body><script src="http://ad.example/track.js"></script></body></html>`;
    const result = await mixedContentEvaluator.evaluate(
      { url: "https://example.com/", fetchedHtml: html },
      {
        fetchHtml: async () => {
          called += 1;
          return { html: "", finalUrl: "", status: 0 };
        },
        runId: "r",
        now: () => 0,
      },
    );
    expect(called).toBe(0);
    expect(result.severity).toBe("fail");
    const ev = result.evidenceJson as Record<string, unknown>;
    expect(ev.scriptCount).toBe(1);
  });
});
