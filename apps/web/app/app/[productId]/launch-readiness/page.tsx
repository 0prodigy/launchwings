"use client";

// T4 (LRC-03) — LaunchWings LRS Scorecard surface. Renders the launch-
// readiness ring, three stage cards (Stage 1 active; Stage 2/3 muted), and a
// drill-in drawer for evidence + fix-action per evaluator.
//
// Data plane:
//   - `agents.getLatestRunForProduct` is the primary read. Tagged-union
//     response on `reason` ("no_url" | "no_run" | "ok").
//   - `products.get` for `metadata.brief.approvedAt` (gates the empty state).
//   - `agents.runAudit` to dispatch a fresh audit. Does NOT return the
//     lrs_runs id; we poll until we observe a new run.id.
//
// Note on lrs_runs.status enum: the schema (packages/db/src/schema.ts ~ line
// 137) is `["running","completed","failed"]`. The original brief mentioned
// "errored" as the failure value; we use the actual enum literal here.

import { use, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { UiEvalResult } from "@/lib/lrs/ui-result";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScoreRing } from "@/components/lrs/score-ring";
import { StageCard } from "@/components/lrs/stage-card";
import {
  EvaluatorDrawer,
  type GeneratedArtifacts,
} from "@/components/lrs/evaluator-drawer";
import { ReauditButton } from "@/components/lrs/reaudit-button";
import { verdictForScore } from "@/lib/lrs/verdict";

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 120_000;

type RunSummary = {
  total?: number;
  pass?: number;
  warn?: number;
  fail?: number;
  score?: number;
  error?: string;
};

type BriefMeta = { approvedAt?: string | null } | undefined | null;

export default function LaunchReadinessPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = use(params);

  const productQuery = trpc.products.get.useQuery({ id: productId });
  const product = productQuery.data?.product;
  const briefApproved = useMemo(() => {
    const meta = (product?.metadata ?? {}) as { brief?: BriefMeta };
    return Boolean(meta.brief?.approvedAt);
  }, [product]);

  // ── Polling state ───────────────────────────────────────────────────────
  // We poll `getLatestRunForProduct` while either:
  //   - the user just hit Re-audit (we haven't yet seen the new run.id), OR
  //   - the existing run is still in-flight (status === "running"), OR
  //   - the brief was just approved and reason is still "no_run" (first
  //     audit dispatch hasn't landed yet).
  // The polling flag plus a ref-based seenRunId avoids the render-loop hazard:
  // we only update React state when a meaningful transition has actually
  // happened (new run id appears, or status flips to a terminal state).
  const seenRunIdRef = useRef<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [pollingStartedAt, setPollingStartedAt] = useState<number | null>(null);
  const [pollingTimedOut, setPollingTimedOut] = useState(false);

  // Ref mirrors the latest run status so the refetchInterval callback can read
  // it without closing over `auditQuery` itself (which would be a TDZ error on
  // Turbopack since the const isn't initialised yet at callback-definition time).
  const auditRunRef = useRef<{ status?: string } | null>(null);

  const auditQuery = trpc.agents.getLatestRunForProduct.useQuery(
    { productId },
    {
      refetchInterval: () => {
        if (polling) return POLL_INTERVAL_MS;
        // Continue polling while a known run is still executing.
        if (auditRunRef.current?.status === "running") return POLL_INTERVAL_MS;
        return false;
      },
    },
  );

  // Keep auditRunRef in sync on every render so the callback above sees fresh data.
  auditRunRef.current = auditQuery.data?.reason === "ok" ? auditQuery.data.run : null;

  // Initialise / clear seenRunId based on observed data. We compare against
  // the ref (NOT a state value) so this effect doesn't re-run every render.
  useEffect(() => {
    const data = auditQuery.data;
    if (!data) return;
    const currentRunId = data.reason === "ok" ? data.run.id : null;
    if (seenRunIdRef.current === null) {
      // First successful read — record what was already there so a subsequent
      // re-audit knows it's "new". If there was no run yet, leave as null.
      seenRunIdRef.current = currentRunId;
      return;
    }
    if (
      polling &&
      currentRunId !== null &&
      currentRunId !== seenRunIdRef.current
    ) {
      seenRunIdRef.current = currentRunId;
      // We saw a new run — let the in-flight check below decide whether to
      // keep polling (status === "running") or stop.
      if (data.reason === "ok" && data.run.status !== "running") {
        setPolling(false);
        setPollingStartedAt(null);
        setPollingTimedOut(false);
      }
    } else if (
      polling &&
      data.reason === "ok" &&
      data.run.id === seenRunIdRef.current &&
      data.run.status === "completed"
    ) {
      // Edge case: re-audit somehow reused the same id (shouldn't happen, but
      // defensive). Treat completion as "done polling".
      setPolling(false);
      setPollingStartedAt(null);
      setPollingTimedOut(false);
    }
  }, [auditQuery.data, polling]);

  // Hard polling timeout. Avoids a stuck spinner if the Trigger.dev task is
  // wedged or the secret isn't configured.
  useEffect(() => {
    if (!polling || pollingStartedAt === null) return;
    const remaining = POLL_TIMEOUT_MS - (Date.now() - pollingStartedAt);
    if (remaining <= 0) {
      setPolling(false);
      setPollingTimedOut(true);
      return;
    }
    const t = setTimeout(() => {
      setPolling(false);
      setPollingTimedOut(true);
    }, remaining);
    return () => clearTimeout(t);
  }, [polling, pollingStartedAt]);

  function handleDispatch() {
    setPolling(true);
    setPollingStartedAt(Date.now());
    setPollingTimedOut(false);
  }

  // ── Drawer state ────────────────────────────────────────────────────────
  const [drawerResult, setDrawerResult] = useState<UiEvalResult | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  function openDrawer(r: UiEvalResult) {
    setDrawerResult(r);
    setDrawerOpen(true);
  }

  // ── Render branches ─────────────────────────────────────────────────────
  if (productQuery.isLoading || auditQuery.isLoading) {
    return <LoadingShell />;
  }

  if (productQuery.error) {
    return <ErrorShell message={productQuery.error.message} />;
  }
  if (auditQuery.error) {
    return <ErrorShell message={auditQuery.error.message} />;
  }

  if (!product || !auditQuery.data) {
    return <LoadingShell />;
  }

  const data = auditQuery.data;

  // Brief not approved → empty state.
  if (!briefApproved) {
    return (
      <Page>
        <EmptyState
          title="Approve your brief to dispatch the first audit"
          body="LaunchWings runs the LRS audit automatically once your brief is approved."
          action={
            <Link href={`/app/${productId}/brief`}>
              <Button variant="default">Open brief</Button>
            </Link>
          }
        />
      </Page>
    );
  }

  // No URL on the product → cannot score.
  if (data.reason === "no_url") {
    return (
      <Page>
        <EmptyState
          title="This product has no live URL"
          body="Add a URL to your product to dispatch the launch-readiness audit."
        />
      </Page>
    );
  }

  // URL present but no run yet (and brief is approved). Either the very first
  // audit is in flight, or it never dispatched — surface the polling state.
  if (data.reason === "no_run") {
    return (
      <Page>
        <PollingBanner
          polling={polling}
          timedOut={pollingTimedOut}
          startedAt={pollingStartedAt}
          message={
            polling
              ? "Audit dispatched, waiting for results…"
              : "No audit has run yet for this URL."
          }
          onCancel={() => {
            setPolling(false);
            setPollingTimedOut(false);
            setPollingStartedAt(null);
          }}
        />
        <div className="flex justify-end">
          <ReauditButton
            url={product.url ?? ""}
            onDispatch={handleDispatch}
            disabled={!product.url}
            label="Run audit"
          />
        </div>
      </Page>
    );
  }

  // reason === "ok"
  const { run, results } = data;
  const summary = (run.summaryJson ?? {}) as RunSummary;

  // Score derivation: prefer `summaryJson.score` (auditTarget writes this on
  // completion). Fall back to pass/total when summary is partial — important
  // during in-flight runs where summaryJson hasn't been finalised yet.
  const stage1Score = computeStage1Score(summary, results);

  const counts = {
    pass:
      typeof summary.pass === "number"
        ? summary.pass
        : results.filter((r) => r.severity === "pass").length,
    warn:
      typeof summary.warn === "number"
        ? summary.warn
        : results.filter((r) => r.severity === "warn").length,
    fail:
      typeof summary.fail === "number"
        ? summary.fail
        : results.filter((r) => r.severity === "fail").length,
  };

  const verdict = verdictForScore(stage1Score, counts.fail);

  return (
    <Page>
      {/* Status banner above the scorecard for in-flight / failed runs. */}
      {run.status === "running" ? (
        <Banner tone="muted">
          <Loader2 className="size-4 animate-spin" />
          <span>Audit in progress — partial results below.</span>
        </Banner>
      ) : null}
      {run.status === "failed" ? (
        <Banner tone="bad">
          <span>
            The last audit run failed
            {summary.error ? `: ${summary.error}` : "."}
          </span>
        </Banner>
      ) : null}
      {pollingTimedOut ? (
        <Banner tone="muted">
          <span>Still running… stopped polling after 2 min.</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => auditQuery.refetch()}
          >
            Refresh
          </Button>
        </Banner>
      ) : null}

      <header className="flex flex-col gap-6 rounded-lg border border-border bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-6">
          <ScoreRing stage1Score={stage1Score} />
          <div className="flex flex-col gap-1">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Launch readiness
            </p>
            <p className={`text-2xl font-semibold ${verdict.tone}`}>
              {verdict.label}
            </p>
            <p className="text-xs text-muted-foreground">
              {counts.pass} pass · {counts.warn} warn · {counts.fail} fail
            </p>
            {run.finishedAt ? (
              <p className="text-xs text-muted-foreground">
                Last run{" "}
                {new Date(run.finishedAt as unknown as string).toLocaleString()}
              </p>
            ) : null}
          </div>
        </div>

        {product.url ? (
          <ReauditButton
            url={product.url}
            onDispatch={handleDispatch}
            disabled={polling || run.status === "running"}
          />
        ) : null}
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <StageCard
          title="Stage 1 — Launch readiness"
          subtitle="Marketing-page hygiene, metadata, hero copy."
          state="active"
          results={results}
          counts={counts}
          onSelect={openDrawer}
        />
        <StageCard
          title="Stage 2 — Trust & growth"
          subtitle="Social proof, retention signals, growth loops."
          state="coming-soon"
        />
        <StageCard
          title="Stage 3 — Scale"
          subtitle="Pricing, conversion, ops readiness."
          state="coming-soon"
        />
      </div>

      <EvaluatorDrawer
        result={drawerResult}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        productId={productId}
        generatedArtifacts={
          ((product?.metadata ?? {}) as {
            generated_artifacts?: GeneratedArtifacts;
          }).generated_artifacts ?? null
        }
      />
    </Page>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function computeStage1Score(
  summary: RunSummary,
  results: UiEvalResult[],
): number | null {
  if (typeof summary.score === "number") return summary.score;
  // Fallback when summaryJson is partial / missing (e.g. mid-run). We use the
  // simple pass/total ratio rather than the harness's weighted formula —
  // documented intentionally as a coarse approximation; the authoritative
  // number is whatever auditTarget writes on completion.
  if (results.length === 0) return null;
  const pass = results.filter((r) => r.severity === "pass").length;
  return Math.round((100 * pass) / results.length);
}

// ── Layout primitives (page-local) ───────────────────────────────────────

function Page({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
      {children}
    </main>
  );
}

function LoadingShell() {
  return (
    <Page>
      <Skeleton className="h-40 w-full" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </Page>
  );
}

function ErrorShell({ message }: { message: string }) {
  return (
    <Page>
      <Card className="border-red-500/30 bg-red-500/5">
        <CardHeader>
          <CardTitle className="text-base">Could not load scorecard</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{message}</p>
        </CardContent>
      </Card>
    </Page>
  );
}

function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{body}</p>
        {action ? <div>{action}</div> : null}
      </CardContent>
    </Card>
  );
}

function PollingBanner({
  polling,
  timedOut,
  startedAt,
  message,
  onCancel,
}: {
  polling: boolean;
  timedOut: boolean;
  startedAt: number | null;
  message: string;
  onCancel: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!polling) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [polling]);
  const remainingSec =
    polling && startedAt
      ? Math.max(0, Math.ceil((POLL_TIMEOUT_MS - (now - startedAt)) / 1000))
      : null;

  return (
    <Card className="border-border bg-card">
      <CardContent className="flex items-center justify-between gap-3 py-4">
        <div className="flex items-center gap-3">
          {polling ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : null}
          <div className="flex flex-col gap-0.5">
            <p className="text-sm">{message}</p>
            {polling && remainingSec !== null ? (
              <p className="text-xs text-muted-foreground">
                Will keep checking for {remainingSec}s.
              </p>
            ) : null}
            {timedOut ? (
              <p className="text-xs text-amber-400">
                Still running… stopped polling after 2 min.
              </p>
            ) : null}
          </div>
        </div>
        {polling ? (
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Stop polling
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Banner({
  tone,
  children,
}: {
  tone: "muted" | "bad";
  children: React.ReactNode;
}) {
  const cls =
    tone === "bad"
      ? "border-red-500/30 bg-red-500/5 text-red-300"
      : "border-border bg-card text-foreground/90";
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-md border px-4 py-3 text-sm ${cls}`}
    >
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
