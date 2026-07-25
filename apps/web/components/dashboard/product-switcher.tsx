"use client";

// T2 — sidebar product switcher. Calls products.list (projected sibling of
// listMine, see packages/trpc/src/routers/products.ts) and refetches every 5s
// while any product is still importing so the dot transitions to "ready"
// without a manual reload.

import { ChevronsUpDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusDot } from "@/components/ui/status-dot";
import { cn } from "@/lib/cn";
import { useActiveProductId } from "@/lib/dashboard/active-product";
import { trpc } from "@/lib/trpc";

function hostOf(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function ProductSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  const activeId = useActiveProductId();
  const query = trpc.products.list.useQuery(undefined, {
    refetchInterval: (q) =>
      q.state.data?.products.some((p) => p.status === "importing") ? 5000 : false,
  });

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click / Escape — small popover, not worth radix/headless.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const products = query.data?.products ?? [];
  const active = products.find((p) => p.id === activeId);

  const triggerLabel = active?.name ?? (activeId ? "Loading…" : "Select product");
  const triggerStatus = active?.status;

  function go(id: string) {
    setOpen(false);
    onNavigate?.();
    router.push(`/app/${id}/brief`);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-transparent px-3 py-2 text-left text-sm text-foreground hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-colors"
      >
        <span className="flex min-w-0 items-center gap-2">
          {triggerStatus ? <StatusDot status={triggerStatus} /> : null}
          <span className="truncate font-medium">{triggerLabel}</span>
        </span>
        <ChevronsUpDown
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground"
        />
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-border bg-card shadow-xl shadow-black/20"
        >
          {query.isLoading ? (
            <div className="flex flex-col gap-2 p-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : query.error ? (
            <div className="flex items-center justify-between gap-2 border-b border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              <span className="truncate">Couldn&apos;t load products</span>
              <button
                type="button"
                onClick={() => void query.refetch()}
                className="rounded border border-red-500/40 px-2 py-0.5 hover:bg-red-500/20"
              >
                Retry
              </button>
            </div>
          ) : products.length === 0 ? (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onNavigate?.();
                router.push("/app");
              }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent/50 transition-colors"
            >
              <span className="text-muted-foreground">No products yet</span>
              <span className="text-primary">Import one →</span>
            </button>
          ) : (
            <ul className="max-h-72 overflow-y-auto py-1">
              {products.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={p.id === activeId}
                    onClick={() => go(p.id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-accent/50 transition-colors",
                      p.id === activeId && "bg-accent",
                    )}
                  >
                    <StatusDot status={p.status} />
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">{p.name}</span>
                    {p.url ? (
                      <span className="truncate text-xs text-muted-foreground">
                        {hostOf(p.url)}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
