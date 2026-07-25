"use client";

// T3 — Discovery section of the brief editor.
//
// Editable: product_summary, value_prop, three_icps, competitors (2..5).
// Read-only: current_seo_posture, channel_suitability_scores. These render
// straight from the server output (never form state) and are NOT included in
// getDiscoveryEdits — `current_seo_posture` is evidence-shaped, not founder
// copy, and `channel_suitability_scores` is the agent's source of truth.

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { InlineInput, InlineTextarea } from "@/components/brief/inline-text";
import { RegenerateButton } from "@/components/brief/regenerate-button";
import type {
  DiscoveryEdits,
  IcpEdit,
  ServerDiscoveryOutput,
} from "@/lib/brief/use-brief-state";

interface DiscoverySectionProps {
  edits: DiscoveryEdits;
  serverOutput: ServerDiscoveryOutput;
  degraded: boolean;
  regenerating: boolean;
  setField: (
    key: "product_summary" | "value_prop",
    value: string,
  ) => void;
  setIcp: (index: number, key: keyof IcpEdit, value: string) => void;
  setCompetitor: (
    index: number,
    key: "name" | "why_they_lose",
    value: string,
  ) => void;
  addCompetitor: () => void;
  removeCompetitor: (index: number) => void;
  onRegenerate: (notes: string | undefined) => void;
}

interface ChannelScore {
  score: number;
  rationale: string;
}

interface SeoPosture {
  title_present: boolean;
  meta_description_present: boolean;
  og_image_present: boolean;
  headline_clarity_score: number;
  notes: string;
}

export function DiscoverySection(props: DiscoverySectionProps) {
  const {
    edits,
    serverOutput,
    degraded,
    regenerating,
    setField,
    setIcp,
    setCompetitor,
    addCompetitor,
    removeCompetitor,
    onRegenerate,
  } = props;

  const seo = (serverOutput.current_seo_posture ?? null) as SeoPosture | null;
  const channels = (serverOutput.channel_suitability_scores ?? null) as
    | Record<string, ChannelScore>
    | null;

  return (
    <section className="flex flex-col gap-5">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Discovery</h2>
        <RegenerateButton
          label="Regenerate Discovery"
          description="Re-run the Discovery agent. Add notes if you want it to focus on something specific."
          disabled={regenerating}
          onSubmit={onRegenerate}
        />
      </header>

      {degraded ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-400">
          We had to fall back to a degraded brief. Add notes and regenerate.
        </div>
      ) : null}

      <InlineTextarea
        id="discovery-product-summary"
        label="Product summary"
        value={edits.product_summary}
        onChange={(v) => setField("product_summary", v)}
        rows={4}
        maxLength={800}
        placeholder="What it is, who it's for, what's in scope."
      />
      <InlineInput
        id="discovery-value-prop"
        label="Value proposition"
        value={edits.value_prop}
        onChange={(v) => setField("value_prop", v)}
        maxLength={300}
        placeholder="One sentence the founder could put on the homepage hero."
      />

      <Separator />

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold tracking-tight">
          Three ICPs
          <span className="ml-2 text-xs font-normal text-[color:var(--color-muted)]">
            specific roles, not vague segments
          </span>
        </h3>
        {edits.three_icps.map((icp, i) => ( // copy-review: ignore
          <IcpCard
            key={i}
            index={i}
            icp={icp} // copy-review: ignore
            onChange={(key, value) => setIcp(i, key, value)}
            idPrefix="discovery-icp" // copy-review: ignore
          />
        ))}
      </div>

      <Separator />

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold tracking-tight">
            Competitors
            <span className="ml-2 text-xs font-normal text-[color:var(--color-muted)]">
              {edits.competitors.length}/5
            </span>
          </h3>
          <Button
            variant="outline"
            size="sm"
            onClick={addCompetitor}
            disabled={edits.competitors.length >= 5}
          >
            Add competitor
          </Button>
        </div>
        {edits.competitors.map((c, i) => (
          <Card key={i} className="border-[color:var(--color-border)]">
            <CardHeader className="flex flex-row items-center justify-between p-4">
              <CardTitle className="text-sm">Competitor {i + 1}</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeCompetitor(i)}
                disabled={edits.competitors.length <= 2}
              >
                Remove
              </Button>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 p-4 pt-0">
              <InlineInput
                id={`discovery-competitor-${i}-name`}
                label="Name"
                value={c.name}
                onChange={(v) => setCompetitor(i, "name", v)}
                maxLength={120}
              />
              <InlineTextarea
                id={`discovery-competitor-${i}-why`}
                label="Why they lose"
                value={c.why_they_lose}
                onChange={(v) => setCompetitor(i, "why_they_lose", v)}
                rows={2}
                maxLength={400}
              />
            </CardContent>
          </Card>
        ))}
      </div>

      {seo ? (
        <>
          <Separator />
          <details className="rounded-md border border-[color:var(--color-border)] p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Current SEO posture (read-only)
            </summary>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <FactRow label="Title present" value={seo.title_present ? "yes" : "no"} />
              <FactRow
                label="Meta description"
                value={seo.meta_description_present ? "yes" : "no"}
              />
              <FactRow label="OG image" value={seo.og_image_present ? "yes" : "no"} />
              <FactRow
                label="Headline clarity"
                value={`${seo.headline_clarity_score}/100`}
              />
            </dl>
            {seo.notes ? (
              <p className="mt-2 text-xs text-[color:var(--color-muted)]">{seo.notes}</p>
            ) : null}
          </details>
        </>
      ) : null}

      {channels ? (
        <details className="rounded-md border border-[color:var(--color-border)] p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Channel suitability scores (read-only)
          </summary>
          <ul className="mt-3 flex flex-col gap-2 text-xs">
            {Object.entries(channels).map(([channel, c]) => (
              <li key={channel} className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between">
                  <span className="font-medium capitalize">{channel}</span>
                  <span className="text-[color:var(--color-muted)]">{c.score}/100</span>
                </div>
                <p className="text-[color:var(--color-muted)]">{c.rationale}</p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function IcpCard({
  index,
  icp, // copy-review: ignore
  onChange,
  idPrefix,
}: {
  index: number;
  icp: IcpEdit; // copy-review: ignore
  onChange: (key: keyof IcpEdit, value: string) => void;
  idPrefix: string;
}) {
  return (
    <Card className="border-[color:var(--color-border)]">
      <CardHeader className="p-4">
        <CardTitle className="text-sm">Profile {index + 1}</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 p-4 pt-0 sm:grid-cols-2">
        <InlineInput
          id={`${idPrefix}-${index}-name`}
          label="Name"
          value={icp.name} // copy-review: ignore
          onChange={(v) => onChange("name", v)}
          maxLength={120}
        />
        <InlineInput
          id={`${idPrefix}-${index}-role`}
          label="Role"
          value={icp.role} // copy-review: ignore
          onChange={(v) => onChange("role", v)}
          maxLength={120}
        />
        <InlineTextarea
          id={`${idPrefix}-${index}-pains`}
          label="Pains (comma-separated)"
          value={icp.pains} // copy-review: ignore
          onChange={(v) => onChange("pains", v)}
          rows={2}
          className="sm:col-span-2"
        />
        <InlineTextarea
          id={`${idPrefix}-${index}-gains`}
          label="Gains (comma-separated)"
          value={icp.gains} // copy-review: ignore
          onChange={(v) => onChange("gains", v)}
          rows={2}
          className="sm:col-span-2"
        />
      </CardContent>
    </Card>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-[color:var(--color-muted)]">{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
