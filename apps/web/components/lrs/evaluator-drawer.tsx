"use client";

// T4 / LRC-04 — drill-in sheet for a single evaluator result. Renders the
// evidence as a key/value table, the founder-facing fix-action markdown, and
// (LRC-04) a "Fix with AI" panel for the three minimum-slice generators
// (tagline regen, privacy policy, posthog snippet) — see fix-actions.ts for
// the descriptor map. Evaluators outside that map still show the disabled
// "Re-run evaluator" placeholder until LRC-04-followup ships the rest.

import type { UiEvalResult } from "@/lib/lrs/ui-result";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SeverityIcon } from "@/components/lrs/severity-icon";
import { renderInlineMarkdown } from "@/lib/lrs/render-inline-markdown";
import {
  getFixActionForResult,
  type FixActionDescriptor,
} from "@/lib/lrs/fix-actions";
import { TaglineFix } from "@/components/lrs/fixes/tagline-fix";
import { PrivacyFix } from "@/components/lrs/fixes/privacy-fix";
import { PosthogFix } from "@/components/lrs/fixes/posthog-fix";

const TONE_TEXT = {
  pass: "text-emerald-400",
  warn: "text-amber-400",
  fail: "text-red-400",
} as const;

// LRC-04 — shape of the per-product `metadata.generated_artifacts` blob, as
// far as this drawer cares. The privacy + posthog fix panels short-circuit
// their forms when the matching artifact already exists.
export interface GeneratedArtifacts {
  privacy_policy?: { markdown: string; generatedAt: string };
  posthog_snippet?: { snippet: string; generatedAt: string };
}

export function EvaluatorDrawer({
  result,
  open,
  onOpenChange,
  productId,
  generatedArtifacts,
}: {
  result: UiEvalResult | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Optional so existing test surfaces / call sites that don't yet thread the
  // productId still type-check; the fix panels only render when both are set.
  productId?: string;
  generatedArtifacts?: GeneratedArtifacts | null;
}) {
  const fixAction = result ? getFixActionForResult(result) : null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex flex-col gap-4 border-[color:var(--color-border)] bg-[color:var(--color-bg)] text-[color:var(--color-fg)] sm:max-w-md"
      >
        {result ? (
          <>
            <SheetHeader className="gap-2">
              <SheetTitle className="flex items-start gap-2">
                <SeverityIcon severity={result.severity} />
                <span className="font-mono text-sm">{result.evaluatorId}</span>
              </SheetTitle>
              <SheetDescription>
                <span className={TONE_TEXT[result.severity]}>
                  {result.severity.toUpperCase()}
                </span>{" "}
                <span className="text-[color:var(--color-muted)]">
                  · score {result.score}/100
                  {result.latencyMs != null ? ` · ${result.latencyMs} ms` : ""}
                </span>
              </SheetDescription>
            </SheetHeader>

            <Separator className="bg-[color:var(--color-border)]" />

            <section className="flex flex-col gap-2">
              <h3 className="text-xs uppercase tracking-wider text-[color:var(--color-muted)]">
                Fix action
              </h3>
              <p className="text-sm leading-relaxed text-[color:var(--color-fg)]/90">
                {result.fixActionMarkdown
                  ? renderInlineMarkdown(result.fixActionMarkdown)
                  : "—"}
              </p>
            </section>

            <Separator className="bg-[color:var(--color-border)]" />

            <section className="flex flex-col gap-2">
              <h3 className="text-xs uppercase tracking-wider text-[color:var(--color-muted)]">
                Evidence
              </h3>
              <EvidenceTable evidence={result.evidenceJson} />
            </section>

            <div className="mt-auto pt-4">
              {fixAction && productId ? (
                <FixPanel
                  descriptor={fixAction}
                  productId={productId}
                  generatedArtifacts={generatedArtifacts ?? null}
                />
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    disabled
                    title="Coming in LRC-04"
                    className="w-full"
                  >
                    Re-run evaluator
                  </Button>
                  <p className="mt-2 text-center text-[10px] uppercase tracking-wider text-[color:var(--color-muted)]">
                    Coming in LRC-04
                  </p>
                </>
              )}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function EvidenceTable({ evidence }: { evidence: unknown }) {
  const obj =
    evidence != null && typeof evidence === "object"
      ? (evidence as Record<string, unknown>)
      : {};
  const entries = Object.entries(obj);
  if (entries.length === 0) {
    return (
      <p className="text-xs text-[color:var(--color-muted)]">
        No evidence captured.
      </p>
    );
  }
  return (
    <dl className="flex flex-col gap-2 text-xs">
      {entries.map(([k, v]) => (
        <div
          key={k}
          className="grid grid-cols-[8rem_1fr] gap-2 rounded-md border border-[color:var(--color-border)] bg-white/[0.02] p-2"
        >
          <dt className="font-mono text-[color:var(--color-muted)]">{k}</dt>
          <dd className="break-words font-mono text-[color:var(--color-fg)]/90">
            {renderEvidenceValue(v)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function FixPanel({
  descriptor,
  productId,
  generatedArtifacts,
}: {
  descriptor: FixActionDescriptor;
  productId: string;
  generatedArtifacts: GeneratedArtifacts | null;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-wider text-[color:var(--color-muted)]">
          Fix with AI
        </h3>
        <span className="text-[10px] uppercase tracking-wider text-[color:var(--color-muted)]">
          {descriptor.label}
        </span>
      </div>
      {descriptor.kind === "regenerate-positioning" ? (
        <TaglineFix productId={productId} />
      ) : descriptor.kind === "generate-privacy" ? (
        <PrivacyFix
          productId={productId}
          existing={generatedArtifacts?.privacy_policy ?? null}
        />
      ) : (
        <PosthogFix
          productId={productId}
          existing={generatedArtifacts?.posthog_snippet ?? null}
        />
      )}
    </section>
  );
}

function renderEvidenceValue(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
