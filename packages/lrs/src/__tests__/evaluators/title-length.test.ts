import { describe, expect, it } from "vitest";
import { judgeTitleLengthFromHtml } from "../../evaluators/title-length";

function htmlWithTitle(t: string): string {
  return `<!doctype html><html><head><title>${t}</title></head></html>`;
}

describe("judgeTitleLengthFromHtml", () => {
  it("passes for a 30-char title (within 10..60)", () => {
    const t = "a".repeat(30);
    const r = judgeTitleLengthFromHtml(htmlWithTitle(t));
    expect(r.severity).toBe("pass");
    expect(r.evidence.length).toBe(30);
  });

  it("warns at 65 chars (60 < length ≤ 70)", () => {
    const t = "a".repeat(65);
    const r = judgeTitleLengthFromHtml(htmlWithTitle(t));
    expect(r.severity).toBe("warn");
  });

  it("warns at 7 chars (5..9 short band)", () => {
    const t = "a".repeat(7);
    const r = judgeTitleLengthFromHtml(htmlWithTitle(t));
    expect(r.severity).toBe("warn");
  });

  it("fails when title is missing/empty", () => {
    const r = judgeTitleLengthFromHtml("<!doctype html><html><head></head></html>");
    expect(r.severity).toBe("fail");
    expect(r.evidence.title).toBeNull();
  });

  it("fails when title is over 70 chars", () => {
    const t = "a".repeat(80);
    const r = judgeTitleLengthFromHtml(htmlWithTitle(t));
    expect(r.severity).toBe("fail");
  });
});
