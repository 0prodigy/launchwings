import { describe, expect, it } from "vitest";
import { judgePrimaryCtaFromHtml } from "../../evaluators/primary-cta";

describe("judgePrimaryCtaFromHtml", () => {
  it("passes for a short verb-led CTA", () => {
    const html = `<!doctype html><html><body><a href="/signup">Start free trial</a></body></html>`;
    const r = judgePrimaryCtaFromHtml(html);
    expect(r.severity).toBe("pass");
    expect(r.evidence.matchedText).toBe("Start free trial");
    expect(r.evidence.matchedTag).toBe("a");
  });

  it("warns when the matched CTA is too wordy (>8 words)", () => {
    const html = `<!doctype html><html><body><button>Get more information about our enterprise plan today now</button></body></html>`;
    const r = judgePrimaryCtaFromHtml(html);
    expect(r.severity).toBe("warn");
    expect(r.evidence.matchedTag).toBe("button");
  });

  it("fails when no verb-led CTA is found", () => {
    const html = `<!doctype html><html><body><a href="/blog">Read the blog</a><a href="/about">About us</a></body></html>`;
    const r = judgePrimaryCtaFromHtml(html);
    expect(r.severity).toBe("fail");
    expect(r.evidence.matchedText).toBeNull();
  });
});
