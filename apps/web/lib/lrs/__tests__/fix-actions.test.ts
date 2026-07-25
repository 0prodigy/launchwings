import { describe, expect, it } from "vitest";
import { getFixActionForResult } from "../fix-actions";
import type { UiEvalResult } from "../ui-result";

function mk(partial: Partial<UiEvalResult>): UiEvalResult {
  return {
    evaluatorId: "x",
    severity: "pass",
    score: 100,
    latencyMs: 0,
    costUsdMicros: 0,
    fixActionMarkdown: null,
    ...partial,
  };
}

describe("getFixActionForResult", () => {
  it("returns regenerate-positioning for hero-llm-judge fail", () => {
    const action = getFixActionForResult(
      mk({ evaluatorId: "dogfood-LRS-02", severity: "fail" }),
    );
    expect(action).toEqual({
      kind: "regenerate-positioning",
      evaluatorId: "dogfood-LRS-02",
      label: expect.any(String),
    });
  });

  it("returns null for hero-llm-judge warn (we only fix on fail)", () => {
    const action = getFixActionForResult(
      mk({ evaluatorId: "dogfood-LRS-02", severity: "warn" }),
    );
    expect(action).toBeNull();
  });

  it("returns generate-privacy when stage1-legal-links has no privacy href (fail)", () => {
    const action = getFixActionForResult(
      mk({
        evaluatorId: "stage1-legal-links",
        severity: "fail",
        evidenceJson: { privacyHref: null, termsHref: null },
      }),
    );
    expect(action?.kind).toBe("generate-privacy");
  });

  it("returns generate-privacy when stage1-legal-links is warn AND privacy is missing (terms present)", () => {
    const action = getFixActionForResult(
      mk({
        evaluatorId: "stage1-legal-links",
        severity: "warn",
        evidenceJson: { privacyHref: null, termsHref: "/terms" },
      }),
    );
    expect(action?.kind).toBe("generate-privacy");
  });

  it("returns null for the terms-only-missing case (privacy present, terms absent)", () => {
    const action = getFixActionForResult(
      mk({
        evaluatorId: "stage1-legal-links",
        severity: "warn",
        evidenceJson: { privacyHref: "/privacy", termsHref: null },
      }),
    );
    expect(action).toBeNull();
  });

  it("returns null for stage1-legal-links pass", () => {
    const action = getFixActionForResult(
      mk({
        evaluatorId: "stage1-legal-links",
        severity: "pass",
        evidenceJson: { privacyHref: "/privacy", termsHref: "/terms" },
      }),
    );
    expect(action).toBeNull();
  });

  it("returns generate-posthog for analytics-beacon-static fail", () => {
    const action = getFixActionForResult(
      mk({ evaluatorId: "dogfood-LRS-11", severity: "fail" }),
    );
    expect(action?.kind).toBe("generate-posthog");
  });

  it("returns null for analytics-beacon-static warn", () => {
    const action = getFixActionForResult(
      mk({ evaluatorId: "dogfood-LRS-11", severity: "warn" }),
    );
    expect(action).toBeNull();
  });

  it("returns null for an unknown evaluator id", () => {
    const action = getFixActionForResult(
      mk({ evaluatorId: "stage1-favicon-presence", severity: "fail" }),
    );
    expect(action).toBeNull();
  });

  it("does not crash when evidenceJson is undefined or non-object", () => {
    expect(() =>
      getFixActionForResult(
        mk({ evaluatorId: "stage1-legal-links", severity: "fail" }),
      ),
    ).not.toThrow();
    expect(() =>
      getFixActionForResult(
        mk({
          evaluatorId: "stage1-legal-links",
          severity: "fail",
          evidenceJson: "garbage",
        }),
      ),
    ).not.toThrow();
  });
});
