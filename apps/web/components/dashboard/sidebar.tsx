"use client";

// T2 — desktop + mobile sidebar contents. The shell (sidebar-shell.tsx) owns
// drawer state and visibility; this component just renders the brand row,
// product switcher, nav, and footer link. Active state is derived from the
// URL segment that follows /app/[productId]/.

import { BarChart3, FileText, Gauge, Megaphone, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ProductSwitcher } from "@/components/dashboard/product-switcher";
import { cn } from "@/lib/cn";
import { useActiveProductId } from "@/lib/dashboard/active-product";

type NavItem = {
  segment: string; // segment under /app/[productId]/
  href: (id: string) => string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const PRIMARY_NAV: NavItem[] = [
  {
    segment: "brief",
    href: (id) => `/app/${id}/brief`,
    label: "Brief",
    icon: FileText,
  },
  {
    segment: "launch-readiness",
    href: (id) => `/app/${id}/launch-readiness`,
    label: "Launch Readiness",
    icon: Gauge,
  },
];

const STUB_NAV: Array<{ label: string; icon: NavItem["icon"] }> = [
  { label: "Channels", icon: Megaphone },
  { label: "Insights", icon: BarChart3 },
  { label: "Settings", icon: Settings },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const productId = useActiveProductId();
  const pathname = usePathname() ?? "";

  // Active segment = the path part right after /app/[productId]/ . If we're
  // not under a product (shouldn't happen inside this layout, but be safe),
  // nothing is highlighted.
  const activeSegment = (() => {
    if (!productId) return null;
    const prefix = `/app/${productId}/`;
    if (!pathname.startsWith(prefix)) return null;
    return pathname.slice(prefix.length).split("/")[0] ?? null;
  })();

  return (
    <aside className="flex h-full flex-col border-r border-border bg-background">
      <Link
        href="/app"
        onClick={onNavigate}
        className="flex items-center gap-2.5 px-4 py-4 text-sm font-semibold tracking-tight text-foreground hover:text-foreground"
      >
        <span
          aria-hidden="true"
          className="flex size-5 items-center justify-center rounded bg-primary"
        >
          <span className="size-2 rounded-sm bg-primary-foreground" />
        </span>
        LaunchWings
      </Link>

      <div className="px-3 pb-3">
        <ProductSwitcher onNavigate={onNavigate} />
      </div>

      <nav className="flex flex-col gap-0.5 px-2 py-1 flex-1">
        {PRIMARY_NAV.map((item) => {
          const Icon = item.icon;
          const disabled = !productId;
          const active = !disabled && activeSegment === item.segment;
          if (disabled) {
            return (
              <span
                key={item.segment}
                aria-disabled="true"
                className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground opacity-40 cursor-not-allowed"
              >
                <Icon className="size-4 shrink-0" />
                {item.label}
              </span>
            );
          }
          return (
            <Link
              key={item.segment}
              href={item.href(productId)}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-accent text-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}

        {STUB_NAV.map(({ label, icon: Icon }) => (
          <span
            key={label}
            aria-disabled="true"
            className="flex items-center justify-between gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground/40 cursor-not-allowed"
          >
            <span className="flex items-center gap-2.5">
              <Icon className="size-4 shrink-0" />
              {label}
            </span>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide opacity-60">
              Soon
            </Badge>
          </span>
        ))}
      </nav>

      <div className="border-t border-border px-4 py-3">
        <Link
          href="/app"
          onClick={onNavigate}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          ← All products
        </Link>
      </div>
    </aside>
  );
}
