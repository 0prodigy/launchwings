import { cn } from "@/lib/cn";

// T2 — tiny presentational primitive for the dashboard product switcher.
// `importing` pulses amber, `ready` is steady emerald, `error` is red.

export type ProductStatus = "importing" | "ready" | "error";

const TONE: Record<ProductStatus, string> = {
  importing: "bg-amber-400 animate-pulse",
  ready: "bg-emerald-400",
  error: "bg-red-400",
};

const LABEL: Record<ProductStatus, string> = {
  importing: "Importing",
  ready: "Ready",
  error: "Import error",
};

export function StatusDot({
  status,
  className,
}: {
  status: ProductStatus;
  className?: string;
}) {
  return (
    <span
      aria-label={LABEL[status]}
      title={LABEL[status]}
      className={cn("inline-block size-2 shrink-0 rounded-full", TONE[status], className)}
    />
  );
}
