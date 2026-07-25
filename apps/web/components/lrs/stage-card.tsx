// T4 — one card per LRS stage. Stage 1 renders the live evaluator results;
// Stage 2 / Stage 3 render as muted "Coming soon" placeholders until the
// follow-up tickets ship the evaluator suites for those stages.

import type { UiEvalResult } from "@/lib/lrs/ui-result";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { EvaluatorRow } from "@/components/lrs/evaluator-row";

type Counts = { pass: number; warn: number; fail: number };

function deriveCounts(results: UiEvalResult[]): Counts {
  let pass = 0;
  let warn = 0;
  let fail = 0;
  for (const r of results) {
    if (r.severity === "pass") pass += 1;
    else if (r.severity === "warn") warn += 1;
    else if (r.severity === "fail") fail += 1;
  }
  return { pass, warn, fail };
}

export function StageCard({
  title,
  subtitle,
  state,
  results,
  counts,
  onSelect,
}: {
  title: string;
  subtitle: string;
  state: "active" | "coming-soon";
  results?: UiEvalResult[];
  /** When provided, takes precedence over computing from `results`. The page
   *  prefers `run.summaryJson` so partial-progress runs render the harness's
   *  authoritative numbers. */
  counts?: Counts;
  onSelect?: (r: UiEvalResult) => void;
}) {
  if (state === "coming-soon") {
    return (
      <Card className="border-[color:var(--color-border)] bg-[color:var(--color-bg)] opacity-60">
        <CardHeader className="gap-1">
          <CardTitle className="flex items-center justify-between text-sm font-semibold tracking-tight text-[color:var(--color-muted)]">
            <span>{title}</span>
            <span className="rounded-md border border-[color:var(--color-border)] px-1.5 py-0.5 text-[10px] uppercase tracking-wider">
              Coming soon
            </span>
          </CardTitle>
          <p className="text-xs text-[color:var(--color-muted)]">{subtitle}</p>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-[color:var(--color-muted)]">
            Evaluators for this stage haven&apos;t shipped yet. The score ring
            shows a muted track until they land.
          </p>
        </CardContent>
      </Card>
    );
  }

  const list = results ?? [];
  const c = counts ?? deriveCounts(list);

  return (
    <Card className="border-[color:var(--color-border)] bg-[color:var(--color-bg)]">
      <CardHeader className="gap-1">
        <CardTitle className="text-sm font-semibold tracking-tight">
          {title}
        </CardTitle>
        <p className="text-xs text-[color:var(--color-muted)]">{subtitle}</p>
        <p className="pt-1 text-xs">
          <CountChip n={c.pass} label="pass" tone="text-emerald-400" />
          <span className="px-1 text-[color:var(--color-muted)]">·</span>
          <CountChip n={c.warn} label="warn" tone="text-amber-400" />
          <span className="px-1 text-[color:var(--color-muted)]">·</span>
          <CountChip n={c.fail} label="fail" tone="text-red-400" />
        </p>
      </CardHeader>
      <CardContent>
        {list.length === 0 ? (
          <p className="text-xs text-[color:var(--color-muted)]">
            No results yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {list.map((r) => (
              <EvaluatorRow key={r.evaluatorId} result={r} onSelect={onSelect} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function CountChip({
  n,
  label,
  tone,
}: {
  n: number;
  label: string;
  tone: string;
}) {
  return (
    <span className={cn("tabular-nums", tone)}>
      {n} {label}
    </span>
  );
}
