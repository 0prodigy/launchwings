"use client";

// T3 — sticky bottom bar with the Approve / Re-approve CTA.
//
// Lives inside the page column (last child) so `sticky bottom-0` works without
// any overflow hackery on the SidebarShell `<main>`. Re-approve confirmation
// dialog warns that re-approval re-dispatches the LRC-02 audit.

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ApproveBarProps {
  approvedAt: string | null;
  /** Disable the CTA when true (regenerating, mutation pending, missing data). */
  disabled: boolean;
  pending: boolean;
  /** Optional inline message rendered to the left of the CTA (audit status, errors). */
  inlineMessage?: { tone: "info" | "error"; text: string } | null;
  onApprove: () => void;
}

export function ApproveBar(props: ApproveBarProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const isReapprove = props.approvedAt !== null;

  function handleClick() {
    if (isReapprove) {
      setConfirmOpen(true);
    } else {
      props.onApprove();
    }
  }

  function handleConfirm() {
    setConfirmOpen(false);
    props.onApprove();
  }

  return (
    <div className="sticky bottom-0 z-10 flex flex-col gap-2 border-t border-[color:var(--color-border)] bg-[color:var(--color-bg)] px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {props.approvedAt ? (
          <Badge variant="secondary" className="text-xs">
            Approved {formatRelative(props.approvedAt)}
          </Badge>
        ) : (
          <span className="text-xs text-[color:var(--color-muted)]">
            Not yet approved
          </span>
        )}
        {props.inlineMessage ? (
          <span
            className={
              props.inlineMessage.tone === "error"
                ? "text-red-400"
                : "text-[color:var(--color-muted)]"
            }
          >
            {props.inlineMessage.text}
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <Button
          onClick={handleClick}
          disabled={props.disabled || props.pending}
        >
          {props.pending
            ? "Submitting…"
            : isReapprove
              ? "Re-approve"
              : "Approve"}
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Re-approve brief?</DialogTitle>
            <DialogDescription>
              This re-dispatches the launch-readiness audit and overwrites the
              previous approval timestamp. Existing audit history is kept.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirm}>Re-approve</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatRelative(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return iso;
  const diffMs = Date.now() - ts;
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}
