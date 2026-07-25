"use client";

// T3 (ONB-06 Slice C) — LaunchWings Brief Editor.
//
// Two-pane layout: left = read-only evidence (importer output + founder brief
// text), right = editable Discovery + Positioning sections. The dashboard
// chrome (sidebar + topbar) comes from app/app/[productId]/layout.tsx; this
// page is just the inner content + a sticky approve bar.
//
// Polling state machine (regenerate flow). The /app entry uses one-shot
// `completed` flags which would ignore a second regenerate dispatch (see
// app/app/page.tsx ~lines 122-126); we use timestamp comparison instead.
// On regenerate dispatch we capture the current `metadata.X.generatedAt` and
// poll products.get every 3s until it advances. A 120s ceiling surfaces a
// "Still running…" banner with a stop-polling escape hatch.

import { useRouter } from "next/navigation";
import { use, useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { ApproveBar } from "@/components/brief/approve-bar";
import { DiscoverySection } from "@/components/brief/discovery-section";
import { EvidencePane } from "@/components/brief/evidence-pane";
import { PositioningSection } from "@/components/brief/positioning-section";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useBriefState,
  type ServerDiscoveryOutput,
  type ServerPositioningOutput,
} from "@/lib/brief/use-brief-state";

// ----- metadata shape (server jsonb) ---------------------------------------
//
// Mirrors what packages/agents/src/tasks/{discovery,positioning}.ts write at
// the merge sites (discovery.ts:437 / positioning.ts:635). The `degraded`
// flag lives at the *top* of the section, not inside `output`.

interface DiscoverySectionMeta {
  output?: ServerDiscoveryOutput;
  degraded?: boolean;
  generatedAt?: string;
}

interface PositioningSectionMeta {
  output?: ServerPositioningOutput;
  degraded?: boolean;
  generatedAt?: string;
}

interface ImportError {
  stage?: "firecrawl" | "browserbase";
  message?: string;
  kind?: string;
}

interface ProductMetadata {
  extracted?: {
    title?: string | null;
    metaDescription?: string | null;
    heroHeadline?: string | null;
    primaryCta?: { text?: string | null; href?: string | null } | null;
  };
  screenshot?: { pngBase64?: string };
  import_error?: ImportError;
  discovery?: DiscoverySectionMeta;
  positioning?: PositioningSectionMeta;
  brief?: { approvedAt?: string; approvedBy?: string };
}

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 120_000;

type RegenSection = "discovery" | "positioning" | null;

interface InlineMessage {
  tone: "info" | "error";
  text: string;
}

export default function BriefEditorPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = use(params);
  const router = useRouter();

  // ----- regenerate state machine ----------------------------------------
  const [regenerating, setRegenerating] = useState<RegenSection>(null);
  const [regenStartedAt, setRegenStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  // Tick a clock once a second while regenerating so the 120s timeout banner
  // reacts without a separate effect per render.
  useEffect(() => {
    if (regenerating === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [regenerating]);

  // Track the timestamps we've "seen" — when the server timestamp advances
  // past these, the regenerate has landed. Refs because we update them
  // synchronously inside the effect that detects the advance.
  const seenDiscoveryTs = useRef<string | null>(null);
  const seenPositioningTs = useRef<string | null>(null);

  // ----- product query (polling driven by regenerate state) --------------
  const productQuery = trpc.products.get.useQuery(
    { id: productId },
    {
      refetchInterval: regenerating !== null ? POLL_INTERVAL_MS : false,
    },
  );

  const product = productQuery.data?.product;
  const metadata = (product?.metadata ?? {}) as ProductMetadata;
  const discoveryMeta = metadata.discovery ?? null;
  const positioningMeta = metadata.positioning ?? null;
  const discoveryOutput = discoveryMeta?.output ?? null;
  const positioningOutput = positioningMeta?.output ?? null;
  const discoveryGeneratedAt = discoveryMeta?.generatedAt ?? null;
  const positioningGeneratedAt = positioningMeta?.generatedAt ?? null;

  // First-sight initialisation of the seen timestamps so we don't immediately
  // think a stale completed run is "fresh". Only runs on the very first read.
  useEffect(() => {
    if (seenDiscoveryTs.current === null && discoveryGeneratedAt) {
      seenDiscoveryTs.current = discoveryGeneratedAt;
    }
    if (seenPositioningTs.current === null && positioningGeneratedAt) {
      seenPositioningTs.current = positioningGeneratedAt;
    }
  }, [discoveryGeneratedAt, positioningGeneratedAt]);

  // Detect regenerate completion by timestamp advance.
  useEffect(() => {
    if (regenerating === "discovery" && discoveryGeneratedAt) {
      if (discoveryGeneratedAt !== seenDiscoveryTs.current) {
        seenDiscoveryTs.current = discoveryGeneratedAt;
        setRegenerating(null);
        setRegenStartedAt(null);
      }
    } else if (regenerating === "positioning" && positioningGeneratedAt) {
      if (positioningGeneratedAt !== seenPositioningTs.current) {
        seenPositioningTs.current = positioningGeneratedAt;
        setRegenerating(null);
        setRegenStartedAt(null);
      }
    }
  }, [regenerating, discoveryGeneratedAt, positioningGeneratedAt]);

  // ----- form state ------------------------------------------------------
  const brief = useBriefState({
    serverDiscovery: discoveryOutput,
    serverPositioning: positioningOutput,
    discoveryGeneratedAt,
    positioningGeneratedAt,
  });

  // ----- mutations -------------------------------------------------------
  const runDiscoveryMut = trpc.products.runDiscovery.useMutation();
  const runPositioningMut = trpc.products.runPositioning.useMutation();
  const approveMut = trpc.products.approveBrief.useMutation();

  const [approveMessage, setApproveMessage] = useState<InlineMessage | null>(null);

  function dispatchDiscovery(notes: string | undefined) {
    setRegenerating("discovery");
    setRegenStartedAt(Date.now());
    seenDiscoveryTs.current = discoveryGeneratedAt ?? null;
    runDiscoveryMut.mutate({
      productId,
      ...(notes !== undefined ? { notes } : {}),
    });
  }

  function dispatchPositioning(notes: string | undefined) {
    setRegenerating("positioning");
    setRegenStartedAt(Date.now());
    seenPositioningTs.current = positioningGeneratedAt ?? null;
    runPositioningMut.mutate({
      productId,
      ...(notes !== undefined ? { notes } : {}),
    });
  }

  async function handleApprove() {
    const discoveryEdits = brief.getDiscoveryEdits();
    const positioningEdits = brief.getPositioningEdits();
    if (!discoveryEdits || !positioningEdits) return;
    setApproveMessage(null);
    try {
      const result = await approveMut.mutateAsync({
        productId,
        brief: {
          discovery: discoveryEdits,
          positioning: positioningEdits,
        },
      });
      // Surface a transient inline message, then navigate. The launch-
      // readiness page is the same destination regardless of audit dispatch
      // outcome — the message just explains what's about to happen there.
      if (result.audit === "skipped_no_url") {
        setApproveMessage({
          tone: "info",
          text: "Brief locked. Add a live URL to dispatch the audit.",
        });
      } else if (result.audit === "skipped_no_runtime") {
        setApproveMessage({
          tone: "info",
          text: "Brief locked. Audit runtime not configured.",
        });
      }
      router.push(`/app/${productId}/launch-readiness`);
    } catch {
      // Render below via approveMut.error.
    }
  }

  // ----- derived render flags -------------------------------------------
  const isLoading = productQuery.isLoading && !product;
  const queryError = productQuery.error;
  const importErrorStage = metadata.import_error?.stage;
  const approvedAt = metadata.brief?.approvedAt ?? null;
  const pollExceeded =
    regenStartedAt !== null && now - regenStartedAt > POLL_TIMEOUT_MS;

  const discoveryDegraded = discoveryMeta?.degraded === true;
  const positioningDegraded = positioningMeta?.degraded === true;

  // Approve is disabled until both sections have server output (so we have
  // something to send) and no regenerate or pending mutation is in flight.
  const canApprove =
    discoveryOutput !== null &&
    positioningOutput !== null &&
    regenerating === null &&
    !runDiscoveryMut.isPending &&
    !runPositioningMut.isPending;

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col">
      <div className="flex-1 px-6 py-6">
        {queryError ? (
          <ErrorCard
            title="Couldn't load this product"
            message={queryError.message}
          />
        ) : null}

        {importErrorStage === "firecrawl" ? (
          <ErrorCard
            title="Couldn't read this site"
            message="The site may be behind a login or only rendered in JavaScript. The brief is still editable below."
          />
        ) : null}

        {regenerating !== null && pollExceeded ? (
          <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <p className="font-medium text-amber-400">Still running…</p>
            <p className="mt-1 text-xs text-muted-foreground">
              The {regenerating} agent is taking longer than usual. The run
              continues server-side; you can stop the UI poll if you want to
              keep editing.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => {
                setRegenerating(null);
                setRegenStartedAt(null);
              }}
            >
              Stop polling
            </Button>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          {isLoading ? (
            <EvidenceSkeleton />
          ) : (
            <EvidencePane
              productUrl={product?.url ?? null}
              productName={product?.name ?? "Product"}
              briefText={product?.briefText ?? null}
              extracted={metadata.extracted ?? null}
              screenshotPngBase64={metadata.screenshot?.pngBase64 ?? null}
            />
          )}

          <div className="flex flex-col gap-8">
            {isLoading ? (
              <FormSkeleton />
            ) : (
              <>
                <DiscoveryPane
                  discoveryOutput={discoveryOutput}
                  discoveryDegraded={discoveryDegraded}
                  regenerating={regenerating === "discovery"}
                  brief={brief}
                  onDispatchNoNotes={() => dispatchDiscovery(undefined)}
                  onDispatchWithNotes={dispatchDiscovery}
                  dispatchPending={runDiscoveryMut.isPending}
                  dispatchError={
                    runDiscoveryMut.error
                      ? {
                          code: runDiscoveryMut.error.data?.code,
                          message: runDiscoveryMut.error.message,
                        }
                      : null
                  }
                />

                <PositioningPane
                  discoveryReady={discoveryOutput !== null}
                  positioningOutput={positioningOutput}
                  positioningDegraded={positioningDegraded}
                  regenerating={regenerating === "positioning"}
                  brief={brief}
                  onDispatchNoNotes={() => dispatchPositioning(undefined)}
                  onDispatchWithNotes={dispatchPositioning}
                  dispatchPending={runPositioningMut.isPending}
                  dispatchError={
                    runPositioningMut.error
                      ? {
                          code: runPositioningMut.error.data?.code,
                          message: runPositioningMut.error.message,
                        }
                      : null
                  }
                />
              </>
            )}

            {approveMut.error ? (
              <ErrorCard
                title="Approve failed"
                message={approveMut.error.message}
              />
            ) : null}
          </div>
        </div>
      </div>

      <ApproveBar
        approvedAt={approvedAt}
        disabled={!canApprove}
        pending={approveMut.isPending}
        inlineMessage={approveMessage}
        onApprove={handleApprove}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inner panes — keep the page body readable. Each pane decides between
// "needs to run" / "regenerating" / "ready" based on the server's output
// being null/non-null.

interface MutationError {
  code?: string;
  message: string;
}

type BriefHandle = ReturnType<typeof useBriefState>;

function DiscoveryPane(props: {
  discoveryOutput: ServerDiscoveryOutput | null;
  discoveryDegraded: boolean;
  regenerating: boolean;
  brief: BriefHandle;
  onDispatchNoNotes: () => void;
  onDispatchWithNotes: (notes: string | undefined) => void;
  dispatchPending: boolean;
  dispatchError: MutationError | null;
}) {
  if (props.dispatchError) {
    const isPrecondition = props.dispatchError.code === "PRECONDITION_FAILED";
    return (
      <ErrorCard
        title={
          isPrecondition
            ? "Agents runtime not configured"
            : "Discovery dispatch failed"
        }
        message={props.dispatchError.message}
      />
    );
  }

  if (props.discoveryOutput === null) {
    return (
      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="text-lg font-semibold tracking-tight">Discovery</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {props.regenerating || props.dispatchPending
            ? "Discovery agent is running… polling every 3s."
            : "Run Discovery first to draft a brief from your imported site / brief."}
        </p>
        <div className="mt-3">
          <Button
            onClick={props.onDispatchNoNotes}
            disabled={props.regenerating || props.dispatchPending}
          >
            {props.regenerating || props.dispatchPending ? "Running…" : "Run Discovery"}
          </Button>
        </div>
      </section>
    );
  }

  if (!props.brief.state.discovery) return <FormSkeleton />;

  return (
    <DiscoverySection
      edits={props.brief.state.discovery}
      serverOutput={props.discoveryOutput}
      degraded={props.discoveryDegraded}
      regenerating={props.regenerating || props.dispatchPending}
      setField={props.brief.setDiscoveryField}
      setIcp={props.brief.setDiscoveryIcp}
      setCompetitor={props.brief.setCompetitor}
      addCompetitor={props.brief.addCompetitor}
      removeCompetitor={props.brief.removeCompetitor}
      onRegenerate={props.onDispatchWithNotes}
    />
  );
}

function PositioningPane(props: {
  discoveryReady: boolean;
  positioningOutput: ServerPositioningOutput | null;
  positioningDegraded: boolean;
  regenerating: boolean;
  brief: BriefHandle;
  onDispatchNoNotes: () => void;
  onDispatchWithNotes: (notes: string | undefined) => void;
  dispatchPending: boolean;
  dispatchError: MutationError | null;
}) {
  if (props.dispatchError) {
    return (
      <ErrorCard
        title="Positioning dispatch failed"
        message={props.dispatchError.message}
      />
    );
  }

  if (!props.discoveryReady) {
    return (
      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="text-lg font-semibold tracking-tight">Positioning</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Run Discovery first — Positioning reads the discovery brief.
        </p>
      </section>
    );
  }

  if (props.positioningOutput === null) {
    return (
      <section className="rounded-md border border-border bg-card p-4">
        <h2 className="text-lg font-semibold tracking-tight">Positioning</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {props.regenerating || props.dispatchPending
            ? "Positioning agent is running… polling every 3s."
            : "Run Positioning to draft 3 ICPs and 5 taglines."}
        </p>
        <div className="mt-3">
          <Button
            onClick={props.onDispatchNoNotes}
            disabled={props.regenerating || props.dispatchPending}
          >
            {props.regenerating || props.dispatchPending
              ? "Running…"
              : "Run Positioning"}
          </Button>
        </div>
      </section>
    );
  }

  if (!props.brief.state.positioning) return <FormSkeleton />;

  return (
    <PositioningSection
      edits={props.brief.state.positioning}
      serverOutput={props.positioningOutput}
      degraded={props.positioningDegraded}
      regenerating={props.regenerating || props.dispatchPending}
      setIcp={props.brief.setPositioningIcp}
      setTagline={props.brief.setTagline}
      onRegenerate={props.onDispatchWithNotes}
    />
  );
}

function ErrorCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/5 p-4">
      <p className="text-sm font-semibold text-red-400">{title}</p>
      <p className="mt-1 text-sm text-foreground/80">{message}</p>
    </div>
  );
}

function EvidenceSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

