import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

// T2 — extracted from audit-results-panel.tsx (the original `ResultCard` icon
// mapping) so the T4 LRS scorecard can render the same severity glyphs without
// duplicating the lookup. The audit-results-panel itself is intentionally NOT
// refactored to consume this in this PR — that swap can land later under a
// reviewer pass.

export type Severity = "pass" | "warn" | "fail";

const ICON = {
  pass: CheckCircle2,
  warn: AlertTriangle,
  fail: XCircle,
} as const;

const TONE: Record<Severity, string> = {
  pass: "text-emerald-400",
  warn: "text-amber-400",
  fail: "text-red-400",
};

export function SeverityIcon({
  severity,
  className,
}: {
  severity: Severity;
  className?: string;
}) {
  const Icon = ICON[severity];
  return (
    <Icon
      aria-hidden="true"
      className={cn("mt-0.5 size-5 shrink-0", TONE[severity], className)}
    />
  );
}
