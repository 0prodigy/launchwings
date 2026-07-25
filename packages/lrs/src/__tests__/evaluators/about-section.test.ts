import { describe, expect, it } from "vitest";
import { judgeAboutSectionFromHtml } from "../../evaluators/about-section";

describe("judgeAboutSectionFromHtml", () => {
  it("passes when an /about link exists", () => {
    const html = `<!doctype html><html><body><a href="/about">About</a></body></html>`;
    const r = judgeAboutSectionFromHtml(html);
    expect(r.severity).toBe("pass");
    expect(r.evidence.linkHref).toBe("/about");
  });

  it("warns when only an inline About heading exists", () => {
    const html = `<!doctype html><html><body><h2>Our Story</h2><p>Founded in...</p></body></html>`;
    const r = judgeAboutSectionFromHtml(html);
    expect(r.severity).toBe("warn");
    expect(r.evidence.linkHref).toBeNull();
    expect(r.evidence.headingText).toBe("Our Story");
  });

  it("fails when neither link nor heading exists", () => {
    const html = `<!doctype html><html><body><h1>Welcome</h1></body></html>`;
    const r = judgeAboutSectionFromHtml(html);
    expect(r.severity).toBe("fail");
  });
});
