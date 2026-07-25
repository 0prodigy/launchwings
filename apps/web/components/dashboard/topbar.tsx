"use client";

// T2 — slim topbar that sits above the page content inside the dashboard
// shell. Left side is a breadcrumb derived from the URL; right side has the
// env hint (preview/development) and the Clerk user button.

import { UserButton } from "@clerk/nextjs";
import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useActiveProductId, useActiveProductName } from "@/lib/dashboard/active-product";

const SEGMENT_LABEL: Record<string, string> = {
  brief: "Brief",
  "launch-readiness": "Launch Readiness",
};

function lastSegmentLabel(pathname: string, productId: string | null): string | null {
  if (!productId) return null;
  const prefix = `/app/${productId}/`;
  if (!pathname.startsWith(prefix)) return null;
  const seg = pathname.slice(prefix.length).split("/")[0];
  if (!seg) return null;
  return SEGMENT_LABEL[seg] ?? null;
}

export function Topbar({ onOpenSidebar }: { onOpenSidebar?: () => void }) {
  const productId = useActiveProductId();
  const productName = useActiveProductName();
  const pathname = usePathname() ?? "";
  const sectionLabel = lastSegmentLabel(pathname, productId);
  const env = process.env.NEXT_PUBLIC_VERCEL_ENV;

  return (
    <header className="sticky top-0 z-10 flex h-11 items-center justify-between gap-4 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="Open navigation"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors md:hidden"
        >
          <Menu className="size-4" />
        </button>
        <nav aria-label="Breadcrumb" className="min-w-0">
          <ol className="flex min-w-0 items-center gap-1.5 text-sm">
            {productName ? (
              <li className="min-w-0 truncate text-muted-foreground">
                {productName}
              </li>
            ) : null}
            {sectionLabel ? (
              <>
                <li aria-hidden="true" className="text-muted-foreground/40 select-none">
                  /
                </li>
                <li className="truncate font-medium text-foreground">{sectionLabel}</li>
              </>
            ) : null}
          </ol>
        </nav>
      </div>

      <div className="flex items-center gap-3">
        {env ? (
          <span className="hidden rounded-full border border-border px-2 py-0.5 text-[11px] uppercase tracking-wider text-muted-foreground sm:inline">
            {env}
          </span>
        ) : null}
        <UserButton afterSignOutUrl="/" />
      </div>
    </header>
  );
}
