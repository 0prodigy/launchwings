"use client";

// T3 — read-only evidence pane (left column of the brief editor).
//
// Surfaces what the URL importer pulled (title, hero headline, primary CTA,
// screenshot) plus the founder's uploaded brief text if any. Mirrors the
// rendering in apps/web/app/app/page.tsx ~line 341 but uses the dashboard
// palette (var(--color-*)) instead of neutral-* so it lives inside the
// SidebarShell chrome.

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ExtractedShape {
  title?: string | null;
  metaDescription?: string | null;
  heroHeadline?: string | null;
  primaryCta?: { text?: string | null; href?: string | null } | null;
}

export interface EvidencePaneProps {
  productUrl: string | null;
  productName: string;
  briefText: string | null;
  extracted: ExtractedShape | null;
  screenshotPngBase64: string | null;
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function EvidencePane(props: EvidencePaneProps) {
  const { productUrl, productName, briefText, extracted, screenshotPngBase64 } = props;
  const hostname = productUrl ? safeHostname(productUrl) : null;

  return (
    <aside className="flex flex-col gap-4">
      <Card className="border-[color:var(--color-border)] bg-[color:var(--color-bg)]">
        <CardHeader className="p-4">
          <CardTitle className="text-sm">
            {hostname ? `Imported from ${hostname}` : productName}
          </CardTitle>
          {productUrl ? (
            <a
              href={productUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-[color:var(--color-muted)] underline-offset-2 hover:underline"
            >
              {productUrl}
            </a>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-3 p-4 pt-0">
          {extracted ? (
            <dl className="grid grid-cols-1 gap-2 text-sm">
              <EvidenceRow label="Title" value={extracted.title ?? null} />
              <EvidenceRow
                label="Hero headline"
                value={extracted.heroHeadline ?? null}
              />
              <EvidenceRow
                label="Primary CTA"
                value={extracted.primaryCta?.text ?? null}
              />
              <EvidenceRow
                label="Meta description"
                value={extracted.metaDescription ?? null}
              />
            </dl>
          ) : (
            <p className="text-xs text-[color:var(--color-muted)]">
              {productUrl
                ? "Site import hasn't completed — agent ran on whatever was available."
                : "No URL imported."}
            </p>
          )}

          {screenshotPngBase64 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`data:image/png;base64,${screenshotPngBase64}`}
              alt="Homepage screenshot"
              className="w-full rounded border border-[color:var(--color-border)]"
            />
          ) : null}
        </CardContent>
      </Card>

      {briefText && briefText.trim().length > 0 ? (
        <Card className="border-[color:var(--color-border)] bg-[color:var(--color-bg)]">
          <CardHeader className="p-4">
            <CardTitle className="text-sm">Founder brief</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <details>
              <summary className="cursor-pointer text-xs text-[color:var(--color-muted)]">
                Show brief text ({briefText.length} chars)
              </summary>
              <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded bg-black/30 p-3 text-xs text-[color:var(--color-fg)]">
                {briefText}
              </pre>
            </details>
          </CardContent>
        </Card>
      ) : null}
    </aside>
  );
}

function EvidenceRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-wide text-[color:var(--color-muted)]">
        {label}
      </dt>
      <dd className="text-[color:var(--color-fg)]">{value ?? "—"}</dd>
    </div>
  );
}
