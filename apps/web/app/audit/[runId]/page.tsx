import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AuditResultsPanel, verdictFor } from "@/components/audit-results-panel";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { loadRunById } from "@/lib/audit-persist";
import { isDbConfigured } from "@/lib/db-optional";

// LRC-01 PR6 — public permalink for an anonymous audit run.
//
// Rendering happens server-side so the OG card / Twitter unfurl gets the
// real score+URL without needing the runner to bake an image (the existing
// /opengraph-image route serves the marketing card; we override only the
// per-page <title> and og:title text).
//
// 404 vs 503:
//   - DATABASE_URL unset → 404 (renders the not-found page so the marketing
//     site still works without a DB; the link being shared was probably
//     issued by a deploy with a DB, but that's the user's expectation gap
//     not ours).
//   - id not a uuid → 404.
//   - id valid but no row → 404.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RunIdSchema = z.string().uuid();

type Props = { params: Promise<{ runId: string }> };

async function fetchRun(runId: string) {
  const parsed = RunIdSchema.safeParse(runId);
  if (!parsed.success) return null;
  if (!isDbConfigured()) return null;
  return loadRunById(parsed.data);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { runId } = await params;
  const run = await fetchRun(runId);
  if (!run) {
    return {
      title: "Audit not found — LaunchWings",
      robots: { index: false, follow: false },
    };
  }
  const score = run.summary.score;
  const targetHost = (() => {
    try {
      return new URL(run.targetUrl).hostname;
    } catch {
      return run.targetUrl;
    }
  })();
  const titleText = run.summary.error
    ? `Launch readiness audit for ${targetHost} — couldn't fetch`
    : `Launch readiness audit for ${targetHost} — ${score}/100`;
  const description =
    "Public LaunchWings launch-readiness audit result. Run yours at launchwings.com/audit.";
  return {
    title: titleText,
    description,
    alternates: { canonical: `https://launchwings.com/audit/${runId}` },
    openGraph: {
      type: "website",
      title: titleText,
      description,
      url: `https://launchwings.com/audit/${runId}`,
    },
    twitter: {
      card: "summary_large_image",
      title: titleText,
      description,
    },
  };
}

export default async function AuditPermalinkPage({ params }: Props) {
  const { runId } = await params;
  const run = await fetchRun(runId);
  if (!run) {
    notFound();
  }

  const targetHost = (() => {
    try {
      return new URL(run.targetUrl).hostname;
    } catch {
      return run.targetUrl;
    }
  })();
  const verdict = verdictFor(run.summary.score, run.summary.fail);
  const finishedAt = new Date(run.finishedAt);
  const finishedLabel = Number.isNaN(finishedAt.getTime())
    ? run.finishedAt
    : finishedAt.toUTCString();

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-6">
      <SiteHeader />

      <section className="flex flex-col gap-6 py-12 sm:py-20">
        <p className="text-sm font-medium tracking-wide text-[color:var(--color-accent)] uppercase">
          Shared audit · read-only
        </p>

        <h1 className="text-balance text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl">
          Launch readiness audit for{" "}
          <span className="text-[color:var(--color-accent)]">{targetHost}</span>
          {run.summary.error ? null : (
            <>
              {" "}
              — <span>{run.summary.score}/100</span>
            </>
          )}
        </h1>

        <p className="text-sm text-[color:var(--color-muted)]">
          Verdict: <span className="text-[color:var(--color-fg)]">{verdict.label}</span>{" "}
          · ran {finishedLabel}
        </p>

        <AuditResultsPanel payload={run} />

        <p className="text-sm text-[color:var(--color-muted)]">
          Want to audit your own URL?{" "}
          <Link
            href="/audit"
            className="text-[color:var(--color-accent)] hover:underline"
          >
            Run a free audit
          </Link>
          .
        </p>
      </section>

      <SiteFooter />
    </main>
  );
}
