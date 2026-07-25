"use client";

// T3 — RegenerateButton. Opens a dialog with an optional notes textarea
// (≤4000 chars per the runDiscovery / runPositioning input schemas) and calls
// the mutation prop on submit. The parent owns the polling state machine — we
// just dispatch.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { InlineTextarea } from "@/components/brief/inline-text";

export interface RegenerateButtonProps {
  /** Visible label, e.g. "Regenerate Discovery". */
  label: string;
  /**
   * Description shown inside the dialog. Should explain what the founder gets
   * by regenerating (e.g. "We'll re-run the Discovery agent with your notes").
   */
  description: string;
  /** Disable while a regenerate is already in flight. */
  disabled?: boolean;
  /** Mutation dispatcher. Receives the trimmed notes (or undefined if blank). */
  onSubmit: (notes: string | undefined) => void;
}

export function RegenerateButton({
  label,
  description,
  disabled,
  onSubmit,
}: RegenerateButtonProps) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");

  function handleSubmit() {
    const trimmed = notes.trim();
    onSubmit(trimmed.length > 0 ? trimmed : undefined);
    setOpen(false);
    setNotes("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <InlineTextarea
          id="regenerate-notes"
          label="Notes (optional)"
          value={notes}
          onChange={setNotes}
          placeholder="What should the agent do differently this time?"
          rows={5}
          maxLength={4000}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={notes.length > 4000}
          >
            Regenerate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
