"use client";

// T3 — Positioning section of the brief editor.
//
// Editable: icps (3), taglines.text (5). Read-only: each tagline's judge_score
// (preserved verbatim through approveBrief by getPositioningEdits — see
// use-brief-state.ts). Inline >=12-word warning is computed client-side from
// the same word-count rule the agent uses (see scoreTaglineUnder12 in
// packages/agents/src/tasks/positioning.ts).

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { InlineInput, InlineTextarea } from "@/components/brief/inline-text";
import { RegenerateButton } from "@/components/brief/regenerate-button";
import type {
  IcpEdit,
  PositioningEdits,
  ServerPositioningOutput,
} from "@/lib/brief/use-brief-state";

interface PositioningSectionProps {
  edits: PositioningEdits;
  serverOutput: ServerPositioningOutput;
  degraded: boolean;
  regenerating: boolean;
  setIcp: (index: number, key: keyof IcpEdit, value: string) => void;
  setTagline: (index: number, value: string) => void;
  onRegenerate: (notes: string | undefined) => void;
}

export function PositioningSection(props: PositioningSectionProps) {
  const {
    edits,
    serverOutput,
    degraded,
    regenerating,
    setIcp,
    setTagline,
    onRegenerate,
  } = props;

  return (
    <section className="flex flex-col gap-5">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Positioning</h2>
        <RegenerateButton
          label="Regenerate Positioning"
          description="Re-run the Positioning agent. Add notes if you want it to focus on something specific."
          disabled={regenerating}
          onSubmit={onRegenerate}
        />
      </header>

      {degraded ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-400">
          Positioning fell back to a degraded brief. Add notes and regenerate.
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold tracking-tight">ICPs</h3>
        {edits.icps.map((icp, i) => ( // copy-review: ignore
          <Card key={i} className="border-[color:var(--color-border)]">
            <CardHeader className="p-4">
              <CardTitle className="text-sm">Profile {i + 1}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 p-4 pt-0 sm:grid-cols-2">
              <InlineInput
                id={`positioning-icp-${i}-name`} // copy-review: ignore
                label="Name"
                value={icp.name} // copy-review: ignore
                onChange={(v) => setIcp(i, "name", v)}
                maxLength={80}
              />
              <InlineInput
                id={`positioning-icp-${i}-role`} // copy-review: ignore
                label="Role"
                value={icp.role} // copy-review: ignore
                onChange={(v) => setIcp(i, "role", v)}
                maxLength={120}
              />
              <InlineTextarea
                id={`positioning-icp-${i}-pains`} // copy-review: ignore
                label="Pains (comma-separated)"
                value={icp.pains} // copy-review: ignore
                onChange={(v) => setIcp(i, "pains", v)}
                rows={2}
                className="sm:col-span-2"
              />
              <InlineTextarea
                id={`positioning-icp-${i}-gains`} // copy-review: ignore
                label="Gains (comma-separated)"
                value={icp.gains} // copy-review: ignore
                onChange={(v) => setIcp(i, "gains", v)}
                rows={2}
                className="sm:col-span-2"
              />
            </CardContent>
          </Card>
        ))}
      </div>

      <Separator />

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold tracking-tight">Taglines</h3>
        {edits.taglines.map((text, i) => {
          const serverRow = serverOutput.taglines[i];
          const wordCount = countWords(text);
          const tooLong = wordCount >= 12;
          return (
            <div
              key={i}
              className="flex flex-col gap-2 rounded-md border border-[color:var(--color-border)] p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-[color:var(--color-muted)]">
                  Tagline {i + 1}
                </span>
                {serverRow ? (
                  <Badge variant="outline" className="text-xs">
                    judge {serverRow.judge_score.total}/4
                  </Badge>
                ) : null}
              </div>
              <InlineInput
                id={`positioning-tagline-${i}`}
                label=""
                value={text}
                onChange={(v) => setTagline(i, v)}
                maxLength={120}
                warning={tooLong ? `${wordCount} words — agents reject ≥12` : null}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Mirror of scoreTaglineUnder12 in packages/agents/src/tasks/positioning.ts. */
function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}
