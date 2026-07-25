"use client";

// LRC-04 — drawer sub-component: re-run the Positioning agent and surface
// the resulting 5 taglines. The mutation is fire-and-forget (the agent runs
// in Trigger.dev); we poll products.get every 3s until
// metadata.positioning.generatedAt advances past the value we captured at
// dispatch. Pattern lifted from apps/web/app/app/[productId]/brief/page.tsx.
//
// Idempotency note: runPositioning hashes `notes` for its dedupe key. Passing
// no notes would collide with a prior brief-editor regen and the run would
// dedupe (timestamp wouldn't advance, polling would hit the 120s timeout).
// We pass a synthetic notes string so the LRS-fix re-run gets its own key.

import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 120_000;
const LRS_FIX_NOTES =
  "lrs-fix: hero copy failed the LLM judge — please draft taglines with a tighter audience+problem+mechanism shape.";

interface ServerTagline {
  text: string;
  judge_score?: {
    audience: boolean;
    problem: boolean;
    mechanism: boolean;
    under12: boolean;
    total: number;
  };
}

interface PositioningMeta {
  output?: { taglines?: ServerTagline[] };
  generatedAt?: string;
}

export function TaglineFix({ productId }: { productId: string }) {
  const [polling, setPolling] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const seenAt = useRef<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const productQuery = trpc.products.get.useQuery(
    { id: productId },
    { refetchInterval: polling ? POLL_INTERVAL_MS : false },
  );

  // Tick a 1s clock while polling so the timeout banner reacts without a
  // separate effect per render.
  useEffect(() => {
    if (!polling) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [polling]);

  const product = productQuery.data?.product;
  const metadata = (product?.metadata ?? {}) as { positioning?: PositioningMeta };
  const positioning = metadata.positioning ?? null;
  const generatedAt = positioning?.generatedAt ?? null;
  const taglines: ServerTagline[] = positioning?.output?.taglines ?? [];

  // Detect advancement.
  useEffect(() => {
    if (polling && generatedAt && generatedAt !== seenAt.current) {
      seenAt.current = generatedAt;
      setPolling(false);
      setStartedAt(null);
    }
  }, [polling, generatedAt]);

  const mutation = trpc.products.runPositioning.useMutation({
    onSuccess: () => {
      // Capture the existing timestamp at dispatch — null is fine, any future
      // generatedAt counts as advancement.
      seenAt.current = generatedAt;
      setPolling(true);
      setStartedAt(Date.now());
    },
  });

  const timedOut =
    polling && startedAt !== null && now - startedAt > POLL_TIMEOUT_MS;

  function handleRun() {
    mutation.mutate({ productId, notes: LRS_FIX_NOTES });
  }

  async function copyTagline(idx: number, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx((cur) => (cur === idx ? null : cur)), 1500);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopiedIdx(idx);
        setTimeout(() => setCopiedIdx((cur) => (cur === idx ? null : cur)), 1500);
      } finally {
        document.body.removeChild(ta);
      }
    }
  }

  // Render states ----------------------------------------------------------
  if (mutation.error) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-red-400">{mutation.error.message}</p>
        <Button type="button" variant="outline" onClick={handleRun}>
          Retry
        </Button>
      </div>
    );
  }

  if (polling) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-[color:var(--color-muted)]">
          Positioning agent is running… polling every 3s.
        </p>
        {timedOut ? (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
            <p className="font-medium text-amber-400">Still running…</p>
            <p className="mt-1 text-[color:var(--color-muted)]">
              Taking longer than usual. The run continues server-side.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => {
                setPolling(false);
                setStartedAt(null);
              }}
            >
              Stop polling
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  if (taglines.length > 0 && seenAt.current !== null) {
    // Render the five taglines from the most recent successful run. We only
    // show this state after we've observed an advancement (seenAt set), so a
    // stale Positioning output doesn't pre-fill the panel before the founder
    // clicks "Re-run".
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-[color:var(--color-muted)]">
          New taglines ready. Pick one and update your hero copy.
        </p>
        <ul className="flex flex-col gap-2">
          {taglines.map((t, i) => (
            <li
              key={i}
              className="flex items-start justify-between gap-2 rounded-md border border-[color:var(--color-border)] bg-white/[0.02] p-2 text-xs"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="break-words text-[color:var(--color-fg)]">
                  {t.text}
                </span>
                {t.judge_score ? (
                  <span className="font-mono text-[10px] text-[color:var(--color-muted)]">
                    judge {t.judge_score.total}/4
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => copyTagline(i, t.text)}
                className="shrink-0 text-[10px] uppercase tracking-wider text-[color:var(--color-muted)] underline hover:text-[color:var(--color-fg)]"
              >
                {copiedIdx === i ? "Copied" : "Copy"}
              </button>
            </li>
          ))}
        </ul>
        <Button type="button" variant="outline" size="sm" onClick={handleRun}>
          Re-run again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-[color:var(--color-muted)]">
        Re-run the Positioning agent with hero-fix guidance. Five new taglines will appear here.
      </p>
      <Button type="button" onClick={handleRun} disabled={mutation.isPending}>
        {mutation.isPending ? "Dispatching…" : "Re-run Positioning"}
      </Button>
    </div>
  );
}
