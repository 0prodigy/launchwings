import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { EvalResult } from "@launchwings/lrs";

// LRC-01 PR6 — extracted from audit-form.tsx so the same render path is
// reused by the live (/audit) flow AND the permalink page (/audit/[runId]).
//
// This component is intentionally pure (no state, no client hooks) so it can
// run inside a server component on the permalink page. The live form wraps
// it in a client component that adds the "share this result" affordance.

export type AuditPanelSummary = {
  pass: number;
  warn: number;
  fail: number;
  score: number;
  error?: string;
  status?: number;
};

export type AuditPanelPayload = {
  summary: AuditPanelSummary;
  results: EvalResult[];
};

export function AuditResultsPanel({ payload }: { payload: AuditPanelPayload }) {
  const { summary, results } = payload;

  if (summary.error) {
    return (
      <section className="flex flex-col gap-4 rounded-lg border border-red-500/30 bg-red-500/5 p-6">
        <h2 className="text-lg font-semibold tracking-tight">We couldn&apos;t reach that URL</h2>
        <p className="text-sm text-[color:var(--color-muted)]">
          {summary.status
            ? `Your URL returned HTTP ${summary.status}.`
            : `Reason: ${summary.error}.`}{" "}
          The audit can&apos;t score what it can&apos;t fetch — fix this first, then re-run.
        </p>
      </section>
    );
  }

  const verdict = verdictFor(summary.score, summary.fail);
  const verdictColor =
    verdict.tone === "good"
      ? "text-emerald-400"
      : verdict.tone === "warn"
        ? "text-amber-400"
        : "text-red-400";

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-xs uppercase tracking-wide text-[color:var(--color-muted)]">
            Launch readiness
          </p>
          <p className={`text-2xl font-semibold ${verdictColor}`}>{verdict.label}</p>
          <p className="text-xs text-[color:var(--color-muted)]">
            {summary.pass} pass · {summary.warn} warn · {summary.fail} fail
          </p>
        </div>
        <div className="flex items-baseline gap-1">
          <span className={`text-5xl font-semibold tracking-tight ${verdictColor}`}>
            {summary.score}
          </span>
          <span className="text-base text-[color:var(--color-muted)]">/100</span>
        </div>
      </div>

      <ul className="flex flex-col gap-3">
        {results.map((r) => (
          <ResultCard key={r.evaluatorId} result={r} />
        ))}
      </ul>
    </section>
  );
}

export function verdictFor(
  score: number,
  fail: number,
): { label: string; tone: "good" | "warn" | "bad" } {
  if (fail > 0 || score < 50) return { label: "Not yet", tone: "bad" };
  if (score < 80) return { label: "Needs work", tone: "warn" };
  return { label: "Ready to launch", tone: "good" };
}

function ResultCard({ result }: { result: EvalResult }) {
  const Icon =
    result.severity === "pass"
      ? CheckCircle2
      : result.severity === "warn"
        ? AlertTriangle
        : XCircle;
  const tone =
    result.severity === "pass"
      ? "text-emerald-400"
      : result.severity === "warn"
        ? "text-amber-400"
        : "text-red-400";

  const evidenceSummary = summariseEvidence(result);

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-4">
      <div className="flex items-start gap-3">
        <Icon aria-hidden="true" className={`mt-0.5 size-5 shrink-0 ${tone}`} />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold tracking-tight">
            <span className={tone}>{result.severity.toUpperCase()}</span>{" "}
            <span className="text-[color:var(--color-muted)]">·</span>{" "}
            <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs">{result.evaluatorId}</code>
          </p>
          {evidenceSummary ? (
            <p className="text-xs text-[color:var(--color-muted)]">{evidenceSummary}</p>
          ) : null}
          <p className="text-sm text-[color:var(--color-fg)]/90">
            {renderInlineMarkdown(result.fixActionMarkdown)}
          </p>
        </div>
      </div>
    </li>
  );
}

/** Tiny inline markdown renderer: just `code` and **bold**. Avoids a dep. */
function renderInlineMarkdown(s: string): React.ReactNode {
  const tokens: Array<{ type: "text" | "code" | "bold"; value: string }> = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) tokens.push({ type: "text", value: s.slice(last, m.index) });
    const tok = m[1]!;
    if (tok.startsWith("`")) tokens.push({ type: "code", value: tok.slice(1, -1) });
    else tokens.push({ type: "bold", value: tok.slice(2, -2) });
    last = m.index + tok.length;
  }
  if (last < s.length) tokens.push({ type: "text", value: s.slice(last) });
  return tokens.map((t, i) => {
    if (t.type === "code") {
      return (
        <code key={i} className="rounded bg-white/5 px-1 py-0.5 text-xs">
          {t.value}
        </code>
      );
    }
    if (t.type === "bold") return <strong key={i}>{t.value}</strong>;
    return <span key={i}>{t.value}</span>;
  });
}

function summariseEvidence(result: EvalResult): string | null {
  const e = result.evidenceJson as Record<string, unknown>;
  if (e === null || typeof e !== "object") return null;
  if ("error" in e && typeof e.error === "string") return `Harness note: ${e.error}`;
  if ("skipped" in e && typeof e.skipped === "string") {
    return `Skipped: ${e.skipped.replace(/_/g, " ")}`;
  }
  if (result.evaluatorId === "dogfood-LRS-08") { // copy-review: ignore — stable evaluator ID, programmatic comparison
    if (typeof e.length === "number") return `Description length: ${e.length} chars`;
  }
  if (result.evaluatorId === "dogfood-LRS-07") { // copy-review: ignore — stable evaluator ID, programmatic comparison
    if (typeof e.ogImageUrl === "string") return `og:image: ${e.ogImageUrl}`;
  }
  if (typeof e.title === "string" && (e.title as string).length > 0) {
    return e.title as string;
  }
  return null;
}
