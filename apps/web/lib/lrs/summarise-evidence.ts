// T4 — extracted from apps/web/components/audit-results-panel.tsx so the LRS
// scorecard surface can render the same evidence summary without depending on
// the audit-results-panel module. The audit-results-panel itself is NOT
// refactored to consume this in this PR — that swap is a follow-up so we keep
// the diff scoped.

import type { UiEvalResult } from "@/lib/lrs/ui-result";

export function summariseEvidence(result: UiEvalResult): string | null {
  const e = result.evidenceJson as Record<string, unknown> | null | undefined;
  if (e == null || typeof e !== "object") return null;
  if ("error" in e && typeof e.error === "string") return `Harness note: ${e.error}`;
  if ("skipped" in e && typeof e.skipped === "string") {
    return `Skipped: ${e.skipped.replace(/_/g, " ")}`;
  }
  // copy-review: ignore — stable evaluator IDs, programmatic comparison.
  if (result.evaluatorId === "dogfood-LRS-08") {
    if (typeof e.length === "number") return `Description length: ${e.length} chars`;
  }
  if (result.evaluatorId === "dogfood-LRS-07") {
    if (typeof e.ogImageUrl === "string") return `og:image: ${e.ogImageUrl}`;
  }
  if (typeof e.title === "string" && (e.title as string).length > 0) {
    return e.title as string;
  }
  return null;
}
