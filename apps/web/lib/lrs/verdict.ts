// T4 — verdict label + tone class for a Stage 1 LRS score. Mirrors
// `verdictFor` semantics in apps/web/components/audit-results-panel.tsx
// (≥80 emerald, ≥50 amber, else red; any hard fail forces the bad band).
// Returns the Tailwind `text-*` class directly so callers can drop it
// straight onto a span without an extra mapping step.

export type Verdict = {
  label: string;
  tone: string; // tailwind text-* class
};

export function verdictForScore(
  score: number | null,
  fail: number,
): Verdict {
  if (score == null) {
    return { label: "Not scored", tone: "text-[color:var(--color-muted)]" };
  }
  if (fail > 0 || score < 50) {
    return { label: "Not yet", tone: "text-red-400" };
  }
  if (score < 80) {
    return { label: "Needs work", tone: "text-amber-400" };
  }
  return { label: "Ready to launch", tone: "text-emerald-400" };
}
