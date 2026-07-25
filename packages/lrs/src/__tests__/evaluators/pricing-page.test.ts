import { describe, expect, it } from "vitest";
import { judgePricingPageFromHtml } from "../../evaluators/pricing-page";

describe("judgePricingPageFromHtml", () => {
  it("passes when an href contains /pricing", () => {
    const html = `<!doctype html><html><body><a href="/pricing">See plans</a></body></html>`;
    const r = judgePricingPageFromHtml(html);
    expect(r.severity).toBe("pass");
    expect(r.evidence.matchedHref).toBe("/pricing");
  });

  it("passes when link text matches Plans", () => {
    const html = `<!doctype html><html><body><a href="/foo">Plans</a></body></html>`;
    const r = judgePricingPageFromHtml(html);
    expect(r.severity).toBe("pass");
    expect(r.evidence.matchedText).toBe("Plans");
  });

  it("fails when no pricing link exists", () => {
    const html = `<!doctype html><html><body><a href="/blog">Blog</a></body></html>`;
    const r = judgePricingPageFromHtml(html);
    expect(r.severity).toBe("fail");
    expect(r.evidence.matchedHref).toBeNull();
  });
});
