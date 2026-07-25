"use client";

// T2 — dashboard chrome. Owns mobile drawer state. Layout is a 2-col grid at
// md+: a fixed-width sidebar on the left and the page column on the right.
// Below md the sidebar is hidden by default and slides in over the content
// when the topbar hamburger is tapped.

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Sidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { cn } from "@/lib/cn";

export function SidebarShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the drawer with Escape on mobile.
  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[220px_1fr]">
      {/* Desktop sidebar — always visible at md+. */}
      <div className="hidden md:block md:h-dvh md:sticky md:top-0">
        <Sidebar />
      </div>

      {/* Mobile drawer — overlay + sliding panel. */}
      <div
        className={cn(
          "fixed inset-0 z-30 md:hidden",
          mobileOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
        aria-hidden={!mobileOpen}
      >
        <div
          onClick={() => setMobileOpen(false)}
          className={cn(
            "absolute inset-0 bg-black/50 transition-opacity",
            mobileOpen ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          className={cn(
            "absolute inset-y-0 left-0 w-64 max-w-[85%] bg-background shadow-xl transition-transform",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
        >
          <div className="flex items-center justify-end p-2">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
              className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-accent"
            >
              <X className="size-4" />
            </button>
          </div>
          <Sidebar onNavigate={() => setMobileOpen(false)} />
        </div>
      </div>

      <main className="flex min-w-0 flex-col">
        <Topbar onOpenSidebar={() => setMobileOpen(true)} />
        {children}
      </main>
    </div>
  );
}
