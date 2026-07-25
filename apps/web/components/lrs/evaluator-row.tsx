// T4 — single row inside a stage card. Renders the severity glyph (via the
// shared T2 SeverityIcon), evaluator id, and a one-line evidence summary. The
// row is a button so the founder can drill into the evidence drawer.

import type { UiEvalResult } from "@/lib/lrs/ui-result";
import { SeverityIcon } from "@/components/lrs/severity-icon";
import { summariseEvidence } from "@/lib/lrs/summarise-evidence";

const TONE_TEXT = {
  pass: "text-emerald-400",
  warn: "text-amber-400",
  fail: "text-red-400",
} as const;

export function EvaluatorRow({
  result,
  onSelect,
}: {
  result: UiEvalResult;
  onSelect?: (r: UiEvalResult) => void;
}) {
  const summary = summariseEvidence(result);
  const tone = TONE_TEXT[result.severity];

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect?.(result)}
        className="flex w-full items-start gap-3 rounded-md border border-transparent px-3 py-2 text-left transition-colors hover:border-[color:var(--color-border)] hover:bg-white/[0.02] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--color-accent)]"
      >
        <SeverityIcon severity={result.severity} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-sm font-medium tracking-tight">
            <span className={tone}>{result.severity.toUpperCase()}</span>{" "}
            <span className="text-[color:var(--color-muted)]">·</span>{" "}
            <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs">
              {result.evaluatorId}
            </code>
          </p>
          {summary ? (
            <p className="truncate text-xs text-[color:var(--color-muted)]">
              {summary}
            </p>
          ) : null}
        </div>
      </button>
    </li>
  );
}
