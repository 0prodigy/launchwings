"use client";

import { useEffect, useId, useRef, useState } from "react";
import posthog from "posthog-js";
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  Loader2,
  Share2,
} from "lucide-react";
import type { EvalResult } from "@launchwings/lrs";
import {
  AuditResultsPanel,
  type AuditPanelSummary,
} from "@/components/audit-results-panel";

// LRC-01 PR4 / PR6 — public anonymous audit demo client component.
//
// State machine: idle → submitting → done | error | rateLimited.
// We submit to /api/audit which runs synchronously (sequential evaluators,
// 6+1 of them, ~5–15s wall-clock). No streaming in v1; the loader is a
// per-evaluator progress hint not bound to actual progress.
//
// PR6: when the response includes a runId AND the deploy persisted a row
// (we can't tell client-side, so we always show the share link — the
// server-side GET will 404/503 if the row didn't make it; copy still works
// either way), we render a "share this result" copy-link affordance.

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "done"; payload: AuditResponse }
  | { kind: "error"; message: string }
  | { kind: "rateLimited"; retryAfterSec: number };

type AuditResponse = {
  ok: true;
  runId: string;
  finishedAt: string;
  summary: AuditPanelSummary;
  results: EvalResult[];
};

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement | string,
        opts: { sitekey: string; callback: (token: string) => void; theme?: "dark" | "light" | "auto" }
      ) => string;
      reset: (id?: string) => void;
    };
  }
}

const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";

const PROGRESS_STEPS = [
  "Resolving DNS + WHOIS",
  "Fetching your homepage",
  "Reading meta tags + OG image",
  "Checking favicon + mixed content",
  "Probing critical paths",
  "Scoring hero copy",
];

function isPosthogLoaded(): boolean {
  return Boolean((posthog as unknown as { __loaded?: boolean }).__loaded);
}

export function AuditForm() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [token, setToken] = useState<string | null>(null);
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);
  const [progressIdx, setProgressIdx] = useState(0);
  const turnstileRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const urlInputId = useId();
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  // Turnstile bootstrap, mirroring waitlist-form.tsx.
  useEffect(() => {
    if (!siteKey) return;
    if (document.querySelector(`script[src="${TURNSTILE_SRC}"]`)) return;
    const s = document.createElement("script");
    s.src = TURNSTILE_SRC;
    s.async = true;
    s.defer = true;
    document.head.appendChild(s);
  }, [siteKey]);

  useEffect(() => {
    if (!siteKey || !turnstileRef.current) return;
    const tryRender = () => {
      if (!window.turnstile || !turnstileRef.current) return false;
      widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
        sitekey: siteKey,
        theme: "dark",
        callback: (t) => setToken(t),
      });
      return true;
    };
    if (tryRender()) return;
    const interval = setInterval(() => {
      if (tryRender()) clearInterval(interval);
    }, 200);
    return () => clearInterval(interval);
  }, [siteKey]);

  // Progress ticker while submitting.
  useEffect(() => {
    if (status.kind !== "submitting") {
      setProgressIdx(0);
      return;
    }
    const interval = setInterval(() => {
      setProgressIdx((i) => Math.min(i + 1, PROGRESS_STEPS.length - 1));
    }, 1500);
    return () => clearInterval(interval);
  }, [status.kind]);

  // Rate-limit countdown.
  useEffect(() => {
    if (status.kind !== "rateLimited") {
      setRetryCountdown(null);
      return;
    }
    setRetryCountdown(status.retryAfterSec);
    const interval = setInterval(() => {
      setRetryCountdown((s) => {
        if (s === null) return null;
        if (s <= 1) {
          clearInterval(interval);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [status]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (status.kind === "submitting") return;

    const formData = new FormData(e.currentTarget);
    const url = String(formData.get("url") ?? "").trim();
    if (!url) {
      setStatus({ kind: "error", message: "Please enter a URL." });
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      setStatus({ kind: "error", message: "Not a valid URL. Include https:// at the start." });
      return;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      setStatus({ kind: "error", message: "Only http and https URLs are supported." });
      return;
    }

    setStatus({ kind: "submitting" });

    if (typeof window !== "undefined" && isPosthogLoaded()) {
      posthog.capture("audit_started", { hostname: parsed.hostname });
    }

    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, turnstileToken: token }),
      });

      if (res.status === 429) {
        const body = (await res.json().catch(() => ({}))) as { retryAfterSec?: number };
        setStatus({
          kind: "rateLimited",
          retryAfterSec: body.retryAfterSec ?? Number(res.headers.get("Retry-After") ?? 3600),
        });
        return;
      }

      if (res.status === 400) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setStatus({
          kind: "error",
          message:
            body.message ?? "We couldn't audit that URL. Try a public production https URL.",
        });
        return;
      }

      if (!res.ok) {
        setStatus({
          kind: "error",
          message: `Audit failed (${res.status}). Try again in a moment.`,
        });
        return;
      }

      const payload = (await res.json()) as AuditResponse;
      setStatus({ kind: "done", payload });

      if (typeof window !== "undefined" && isPosthogLoaded()) {
        posthog.capture("audit_completed", {
          pass: payload.summary.pass,
          warn: payload.summary.warn,
          fail: payload.summary.fail,
          score: payload.summary.score,
          fetch_error: payload.summary.error ?? null,
        });
      }

      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current);
        setToken(null);
      }
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Network error. Try again?",
      });
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor={urlInputId} className="sr-only">
            Your product URL
          </label>
          <input
            id={urlInputId}
            type="url"
            name="url"
            inputMode="url"
            autoComplete="url"
            required
            placeholder="https://yourstartup.com"
            disabled={status.kind === "submitting"}
            className="flex-1 rounded-lg border border-[color:var(--color-border)] bg-transparent px-4 py-3 text-base outline-none transition focus:border-[color:var(--color-accent)] focus:ring-2 focus:ring-[color:var(--color-accent)]/30 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={status.kind === "submitting"}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[color:var(--color-accent)] px-5 py-3 text-base font-semibold text-[color:var(--color-accent-fg)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status.kind === "submitting" ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <>
                Run audit
                <ArrowRight aria-hidden="true" className="size-4" />
              </>
            )}
          </button>
        </div>

        {siteKey ? <div ref={turnstileRef} aria-hidden="true" /> : null}

        {status.kind === "error" ? (
          <p role="alert" className="text-sm text-red-400">
            {status.message}
          </p>
        ) : null}

        {status.kind === "rateLimited" ? (
          <p role="alert" className="text-sm text-amber-400">
            You&apos;ve hit the demo rate limit (5 audits per hour).
            {retryCountdown !== null && retryCountdown > 0
              ? ` Try again in ${formatDuration(retryCountdown)}.`
              : " You can try again now."}
          </p>
        ) : null}
      </form>

      {status.kind === "submitting" ? <ProgressList currentIdx={progressIdx} /> : null}

      {status.kind === "done" ? (
        <>
          <AuditResultsPanel payload={status.payload} />
          <NextStepsCta payload={status.payload} />
          <ShareLink runId={status.payload.runId} />
        </>
      ) : null}
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

function ProgressList({ currentIdx }: { currentIdx: number }) {
  return (
    <ul className="flex flex-col gap-2 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-4 text-sm">
      {PROGRESS_STEPS.map((label, i) => {
        const isDone = i < currentIdx;
        const isActive = i === currentIdx;
        return (
          <li key={label} className="flex items-center gap-2">
            {isDone ? (
              <CheckCircle2
                aria-hidden="true"
                className="size-4 text-[color:var(--color-accent)]"
              />
            ) : isActive ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin text-[color:var(--color-accent)]" />
            ) : (
              <span
                aria-hidden="true"
                className="inline-block size-4 rounded-full border border-[color:var(--color-border)]"
              />
            )}
            <span
              className={
                isActive
                  ? "text-[color:var(--color-fg)]"
                  : "text-[color:var(--color-muted)]"
              }
            >
              {label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function NextStepsCta({ payload }: { payload: AuditResponse }) {
  const fail = payload.summary?.fail ?? 0;
  const warn = payload.summary?.warn ?? 0;
  const score = payload.summary?.score ?? null;

  // The CTA copy adapts to what the audit found. Three rough buckets:
  //   - severe (fail > 0 OR score < 50)        — we'd fix the broken things
  //   - meaningful work (warn > 0 OR < 80)     — there's work left
  //   - clean run (score >= 80, no fails)      — most are not here; ship the agents
  const headline =
    fail > 0 || (score !== null && score < 50)
      ? "We&apos;d fix what&apos;s broken — and run the rest of the launch."
      : warn > 0 || (score !== null && score < 80)
      ? "There&apos;s real work left. We&apos;d run it."
      : "Audit&apos;s clean. Now you need a launch.";

  const detail =
    "An agent team that drafts every channel in your voice, submits to 30+ directories, sends outreach, writes programmatic SEO, and reports back what brought paying customers. Join the closed beta.";

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-[color:var(--color-accent)]/30 bg-[color:var(--color-accent)]/5 p-6 sm:p-8">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium tracking-wide uppercase text-[color:var(--color-accent)]">
          Get the rest of the team
        </p>
        <h3
          className="text-balance text-xl font-semibold leading-tight tracking-tight sm:text-2xl"
          dangerouslySetInnerHTML={{ __html: headline }}
        />
        <p className="text-sm leading-relaxed text-[color:var(--color-muted)]">
          {detail}
        </p>
      </div>
      <a
        href="/#waitlist"
        className="inline-flex items-center gap-2 self-start rounded-md bg-[color:var(--color-accent)] px-4 py-2 text-sm font-semibold text-[color:var(--color-accent-fg)] hover:opacity-90"
      >
        Join the waitlist
        <ArrowRight aria-hidden="true" className="size-4" />
      </a>
    </div>
  );
}

function ShareLink({ runId }: { runId: string }) {
  const [copied, setCopied] = useState(false);
  // Render the path; combining with origin happens client-side at copy time so
  // the server snapshot never bakes in `localhost`.
  const path = `/audit/${runId}`;

  async function onCopy() {
    if (typeof window === "undefined") return;
    const fullUrl = `${window.location.origin}${path}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(fullUrl);
      } else {
        // Legacy fallback — execCommand is deprecated but still works.
        const ta = document.createElement("textarea");
        ta.value = fullUrl;
        ta.setAttribute("readonly", "");
        ta.style.position = "absolute";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      if (isPosthogLoaded()) {
        posthog.capture("audit_share_copied", { runId });
      }
    } catch {
      // Silent — we can't help if the clipboard API rejects.
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[color:var(--color-accent)]/20 bg-[color:var(--color-accent)]/5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-sm">
        <Share2
          aria-hidden="true"
          className="size-4 shrink-0 text-[color:var(--color-accent)]"
        />
        <p className="text-[color:var(--color-fg)]/90">
          Share this result —{" "}
          <a
            href={path}
            className="font-mono text-xs text-[color:var(--color-accent)] hover:underline"
          >
            launchwings.com{path}
          </a>
        </p>
      </div>
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex items-center gap-2 self-start rounded-md border border-[color:var(--color-border)] px-3 py-1.5 text-xs font-medium transition hover:bg-white/5 sm:self-auto"
      >
        {copied ? (
          <>
            <CheckCircle2
              aria-hidden="true"
              className="size-3.5 text-[color:var(--color-accent)]"
            />
            Copied
          </>
        ) : (
          <>
            <Copy aria-hidden="true" className="size-3.5" />
            Copy link
          </>
        )}
      </button>
    </div>
  );
}
