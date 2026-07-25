"use client";

// LRC-04 — drawer sub-component: generate a PostHog install snippet.
// Sync mutation; renders the snippet in a <pre> with copy-to-clipboard.

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

type Host = "us" | "eu";

interface ExistingArtifact {
  snippet: string;
  generatedAt: string;
}

const KEY_RE = /^phc_[A-Za-z0-9]{20,}$/;

export function PosthogFix({
  productId,
  existing,
}: {
  productId: string;
  existing: ExistingArtifact | null;
}) {
  const [projectKey, setProjectKey] = useState("");
  const [host, setHost] = useState<Host>("us");
  const [showFormAnyway, setShowFormAnyway] = useState(false);
  const [copied, setCopied] = useState(false);

  const mutation = trpc.products.generatePosthogSnippet.useMutation();

  const justGenerated = mutation.data?.artifact ?? null;
  const artifact: ExistingArtifact | null =
    justGenerated ?? (showFormAnyway ? null : existing);

  const keyValid = KEY_RE.test(projectKey);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!keyValid) return;
    mutation.mutate({ productId, projectKey: projectKey.trim(), host });
  }

  async function handleCopy() {
    if (!artifact) return;
    try {
      await navigator.clipboard.writeText(artifact.snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = artifact.snippet;
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
          {artifact.snippet}
        </pre>
        <p className="text-xs text-[color:var(--color-muted)]">
          Paste this into the &lt;head&gt; of your site to install PostHog. Then re-run the audit.
        </p>
        <div>
          <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
            {copied ? "Copied" : "Copy snippet"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="lrc04-ph-key">PostHog project API key</Label>
        <Input
          id="lrc04-ph-key"
          value={projectKey}
          onChange={(e) => setProjectKey(e.target.value)}
          placeholder="phc_abc123..."
          required
        />
        {projectKey.length > 0 && !keyValid ? (
          <p className="text-xs text-amber-400">
            Key must start with <code>phc_</code> followed by 20+ alphanumeric characters.
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="lrc04-ph-host">Host region</Label>
        <Select value={host} onValueChange={(v) => setHost(v as Host)}>
          <SelectTrigger id="lrc04-ph-host">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="us">US (us.i.posthog.com)</SelectItem>
            <SelectItem value="eu">EU (eu.i.posthog.com)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {mutation.error ? (
        <p className="text-xs text-red-400">{mutation.error.message}</p>
      ) : null}
      <Button type="submit" disabled={!keyValid || mutation.isPending}>
        {mutation.isPending ? "Generating…" : "Generate snippet"}
      </Button>
    </form>
  );
}
