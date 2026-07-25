"use client";

// T4 — kicks off a fresh audit via `agents.runAudit`. The mutation does NOT
// return the new lrs_runs id (that row gets created inside the Trigger.dev
// task body); the parent page handles polling `getLatestRunForProduct` until
// it observes a new run.id.

import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

export function ReauditButton({
  url,
  onDispatch,
  disabled,
  label = "Re-audit",
}: {
  url: string;
  onDispatch: () => void;
  disabled?: boolean;
  label?: string;
}) {
  const mutation = trpc.agents.runAudit.useMutation({
    onSuccess: () => {
      onDispatch();
    },
  });

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        onClick={() => mutation.mutate({ url })}
        disabled={disabled || mutation.isPending}
      >
        {mutation.isPending ? "Dispatching…" : label}
      </Button>
      {mutation.error ? (
        <p className="text-xs text-red-400">{mutation.error.message}</p>
      ) : null}
    </div>
  );
}
