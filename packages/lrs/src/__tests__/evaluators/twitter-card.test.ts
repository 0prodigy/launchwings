import { describe, expect, it } from "vitest";
import { judgeTwitterCardFromHtml } from "../../evaluators/twitter-card";

describe("judgeTwitterCardFromHtml", () => {
  it("passes when card + title + description are all set", () => {
    const html = `<!doctype html><html><head>
      <meta name="twitter:card" content="summary_large_image">
      <meta name="twitter:title" content="Hello">
      <meta name="twitter:description" content="World">
    </head></html>`;
    const r = judgeTwitterCardFromHtml(html);
    expect(r.severity).toBe("pass");
    expect(r.evidence.card).toBe("summary_large_image");
  });

  it("warns when card present but title/description missing", () => {
    const html = `<!doctype html><html><head>
      <meta name="twitter:card" content="summary">
    </head></html>`;
    const r = judgeTwitterCardFromHtml(html);
    expect(r.severity).toBe("warn");
    expect(r.evidence.title).toBeNull();
  });

  it("fails when twitter:card meta is missing", () => {
    const html = `<!doctype html><html><head></head></html>`;
    const r = judgeTwitterCardFromHtml(html);
    expect(r.severity).toBe("fail");
    expect(r.evidence.card).toBeNull();
  });
});
