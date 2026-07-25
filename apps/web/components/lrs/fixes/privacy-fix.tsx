"use client";

// LRC-04 — drawer sub-component: generate a Privacy Policy from a small form.
// Sync mutation; renders the resulting markdown in a <pre> with copy +
// download affordances. Short-circuits the form when an artifact already
// exists on the product (founder can still regenerate via a link).

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Jurisdiction = "US" | "EU" | "UK" | "Other";

interface ExistingArtifact {
  markdown: string;
  generatedAt: string;
}

export function PrivacyFix({
  productId,
  existing,
}: {
  productId: string;
  existing: ExistingArtifact | null;
}) {
  const [orgName, setOrgName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction>("US");
  const [showFormAnyway, setShowFormAnyway] = useState(false);
  const [copied, setCopied] = useState(false);

  const mutation = trpc.products.generatePrivacyPolicy.useMutation();

  const justGenerated = mutation.data?.artifact ?? null;
  const artifact: ExistingArtifact | null =
    justGenerated ?? (showFormAnyway ? null : existing);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate({
      productId,
      orgName: orgName.trim(),
      contactEmail: contactEmail.trim(),
      jurisdiction,
    });
  }

  async function handleCopy() {
    if (!artifact) return;
    try {
      await navigator.clipboard.writeText(artifact.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can reject in restricted contexts (iframes, no HTTPS in
      // dev). Fall back to a hidden textarea selection.
      const ta = document.createElement("textarea");
      ta.value = artifact.markdown;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } finally {
        document.body.removeChild(ta);
      }
    }
  }

  function handleDownload() {
    if (!artifact) return;
    const blob = new Blob([artifact.markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "privacy-policy.md";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (artifact) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-[color:var(--color-muted)]">
            Generated {new Date(artifact.generatedAt).toLocaleString()}
          </p>
          <button
            type="button"
            className="text-xs text-[color:var(--color-muted)] underline hover:text-[color:var(--color-fg)]"
            onClick={() => {
              setShowFormAnyway(true);
              mutation.reset();
            }}
          >
            Regenerate
          </button>
        </div>
        <pre className="max-h-72 overflow-auto rounded-md border border-[color:var(--color-border)] bg-white/[0.02] p-3 text-xs leading-relaxed">
          {artifact.markdown}
        </pre>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
            {copied ? "Copied" : "Copy markdown"}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleDownload}>
            Download .md
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="lrc04-priv-org">Organization name</Label>
        <Input
          id="lrc04-priv-org"
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          placeholder="Acme Inc."
          required
          maxLength={120}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="lrc04-priv-email">Contact email</Label>
        <Input
          id="lrc04-priv-email"
          type="email"
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
          placeholder="privacy@acme.com"
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="lrc04-priv-jur">Jurisdiction</Label>
        <Select
          value={jurisdiction}
          onValueChange={(v) => setJurisdiction(v as Jurisdiction)}
        >
          <SelectTrigger id="lrc04-priv-jur">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="US">United States (CCPA)</SelectItem>
            <SelectItem value="EU">European Union (GDPR)</SelectItem>
            <SelectItem value="UK">United Kingdom (UK GDPR)</SelectItem>
            <SelectItem value="Other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {mutation.error ? (
        <p className="text-xs text-red-400">{mutation.error.message}</p>
      ) : null}
      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? "Generating…" : "Generate Privacy Policy"}
      </Button>
    </form>
  );
}
