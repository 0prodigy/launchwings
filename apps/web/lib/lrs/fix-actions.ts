// LRC-04 — map an LRS evaluator result to a "Fix with AI" descriptor, or
// null when the result has no minimum-slice generator wired up yet.
//
// The three minimum-slice triggers:
//   - dogfood-LRS-02       (hero llm judge)             severity=fail   → re-run Positioning
//   - stage1-legal-links   (privacy + terms presence)   privacyHref==null  → generate Privacy Policy
//   - dogfood-LRS-11       (analytics beacon static)    severity=fail   → generate PostHog snippet
//
// Note on legal-links: the warn case where privacy IS present and terms is
// missing must NOT return a privacy-fix descriptor. We narrow on the
// evidence shape before deciding.

import type { UiEvalResult } from "@/lib/lrs/ui-result";

export type FixActionDescriptor =
  | {
      kind: "regenerate-positioning";
      evaluatorId: "dogfood-LRS-02";
      label: string;
    }
  | {
      kind: "generate-privacy";
      evaluatorId: "stage1-legal-links";
      label: string;
    }
  | {
      kind: "generate-posthog";
      evaluatorId: "dogfood-LRS-11";
      label: string;
    };

function readPrivacyHref(evidence: unknown): string | null | undefined {
  if (evidence == null || typeof evidence !== "object") return undefined;
  const rec = evidence as Record<string, unknown>;
  const v = rec.privacyHref;
  if (v === null) return null;
  if (typeof v === "string") return v;
  return undefined;
}

export function getFixActionForResult(
  result: UiEvalResult,
): FixActionDescriptor | null {
  // 1) Hero copy fail → re-run Positioning to draft new taglines.
  if (
    result.evaluatorId === "dogfood-LRS-02" &&
    result.severity === "fail"
  ) {
    return {
      kind: "regenerate-positioning",
      evaluatorId: "dogfood-LRS-02",
      label: "Re-run Positioning",
    };
  }

  // 2) Legal links: ONLY when privacyHref is absent. Terms-only-missing
  //    (privacyHref present, severity=warn) must fall through to null.
  if (result.evaluatorId === "stage1-legal-links") {
    if (result.severity === "fail" || result.severity === "warn") {
      const privacyHref = readPrivacyHref(result.evidenceJson);
      if (privacyHref == null) {
        return {
          kind: "generate-privacy",
          evaluatorId: "stage1-legal-links",
          label: "Generate Privacy Policy",
        };
      }
    }
  }

  // 3) Analytics beacon fail → generate a PostHog snippet.
  if (
    result.evaluatorId === "dogfood-LRS-11" &&
    result.severity === "fail"
  ) {
    return {
      kind: "generate-posthog",
      evaluatorId: "dogfood-LRS-11",
      label: "Generate PostHog snippet",
    };
  }

  return null;
}
