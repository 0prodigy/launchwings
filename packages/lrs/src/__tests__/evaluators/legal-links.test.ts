import { describe, expect, it } from "vitest";
import { judgeLegalLinksFromHtml } from "../../evaluators/legal-links";

describe("judgeLegalLinksFromHtml", () => {
  it("passes when both privacy and terms are present", () => {
    const html = `<!doctype html><html><body>
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
    </body></html>`;
    const r = judgeLegalLinksFromHtml(html);
    expect(r.severity).toBe("pass");
    expect(r.evidence.privacyHref).toBe("/privacy");
    expect(r.evidence.termsHref).toBe("/terms");
  });

  it("warns when only one is present", () => {
    const html = `<!doctype html><html><body>
      <a href="/privacy">Privacy</a>
    </body></html>`;
    const r = judgeLegalLinksFromHtml(html);
    expect(r.severity).toBe("warn");
    expect(r.evidence.termsHref).toBeNull();
  });

  it("fails when neither is present", () => {
    const html = `<!doctype html><html><body><a href="/blog">Blog</a></body></html>`;
    const r = judgeLegalLinksFromHtml(html);
    expect(r.severity).toBe("fail");
  });
});
