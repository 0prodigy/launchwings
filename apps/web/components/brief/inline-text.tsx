"use client";

// T3 — thin wrappers around Input / Textarea that render a label + char count.
// Used by every editable field in the brief editor so the visual rhythm is
// consistent (label above, char count under-right, focus ring from the
// underlying primitive).

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";

interface CommonProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Soft cap — shown in the counter, not enforced. */
  maxLength?: number;
  disabled?: boolean;
  className?: string;
  /** Optional inline warning shown under the field (e.g. "tagline >12 words"). */
  warning?: string | null;
}

export function InlineInput(props: CommonProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", props.className)}>
      <Label htmlFor={props.id}>{props.label}</Label>
      <Input
        id={props.id}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        disabled={props.disabled}
      />
      <FieldFooter
        warning={props.warning}
        length={props.value.length}
        maxLength={props.maxLength}
      />
    </div>
  );
}

interface InlineTextareaProps extends CommonProps {
  rows?: number;
}

export function InlineTextarea(props: InlineTextareaProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", props.className)}>
      <Label htmlFor={props.id}>{props.label}</Label>
      <Textarea
        id={props.id}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        disabled={props.disabled}
        rows={props.rows ?? 3}
      />
      <FieldFooter
        warning={props.warning}
        length={props.value.length}
        maxLength={props.maxLength}
      />
    </div>
  );
}

function FieldFooter({
  warning,
  length,
  maxLength,
}: {
  warning?: string | null;
  length: number;
  maxLength?: number;
}) {
  if (!warning && maxLength === undefined) return null;
  return (
    <div className="flex items-center justify-between text-xs text-[color:var(--color-muted)]">
      {warning ? (
        <span className="text-amber-400">{warning}</span>
      ) : (
        <span aria-hidden="true">&nbsp;</span>
      )}
      {maxLength !== undefined ? (
        <span
          className={cn(
            length > maxLength ? "text-amber-400" : undefined,
          )}
        >
          {length}/{maxLength}
        </span>
      ) : null}
    </div>
  );
}
