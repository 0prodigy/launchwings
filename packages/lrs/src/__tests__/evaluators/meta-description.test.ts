import { describe, expect, it } from "vitest";
import { evaluateMetaDescriptionFromHtml } from "../../evaluators/meta-description";

// Pure-function tests for the meta-description evaluator. No network, no DB.
// We assemble HTML strings of known length so the boundaries (155 / 160) are
// exercised without depending on a real-world fixture's exact wording.

function htmlWithDescription(desc: string): string {
  return `<!doctype html><html><head><meta name="description" content="${desc}"></head><body></body></html>`;
}

function descOfLength(n: number): string {
  // Avoid the literal `"` so we don't break the attribute. Use ASCII letters
  // so length-in-chars equals length-in-bytes.
  return "a".repeat(n);
}

describe("evaluateMetaDescriptionFromHtml", () => {
  it("passes for under-limit descriptions (146 chars — current launchwings.com)", () => {
    const desc = descOfLength(146);
    const result = evaluateMetaDescriptionFromHtml(htmlWithDescription(desc));
    expect(result.severity).toBe("pass");
    expect(result.evidence.length).toBe(146);
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("passes at exactly the pass limit (155 chars)", () => {
    const desc = descOfLength(155);
    const result = evaluateMetaDescriptionFromHtml(htmlWithDescription(desc));
    expect(result.severity).toBe("pass");
    expect(result.evidence.length).toBe(155);
  });

  it("warns in the warn zone (156 chars)", () => {
    const desc = descOfLength(156);
    const result = evaluateMetaDescriptionFromHtml(htmlWithDescription(desc));
    expect(result.severity).toBe("warn");
    expect(result.evidence.length).toBe(156);
  });

  it("warns at the warn ceiling (160 chars)", () => {
    const desc = descOfLength(160);
    const result = evaluateMetaDescriptionFromHtml(htmlWithDescription(desc));
    expect(result.severity).toBe("warn");
  });

  it("fails over the warn ceiling (172 chars — original audit-log finding)", () => {
    const desc = descOfLength(172);
    const result = evaluateMetaDescriptionFromHtml(htmlWithDescription(desc));
    expect(result.severity).toBe("fail");
    expect(result.evidence.length).toBe(172);
    expect(result.fixActionMarkdown).toMatch(/trim|≤/i);
  });

  it("fails when the meta tag is missing entirely", () => {
    const result = evaluateMetaDescriptionFromHtml(
      "<!doctype html><html><head></head><body></body></html>",
    );
    expect(result.severity).toBe("fail");
    expect(result.evidence.description).toBeNull();
  });
});
