"use client";

import { useEffect, useId, useRef, useState } from "react";
import posthog from "posthog-js";
import { Loader2, ArrowRight, CheckCircle2 } from "lucide-react";

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string };

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

export function WaitlistForm() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [token, setToken] = useState<string | null>(null);
  const turnstileRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const emailId = useId();
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

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

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status.kind === "submitting") return;
    const formData = new FormData(e.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    if (!email || !email.includes("@")) {
      setStatus({ kind: "error", message: "Please enter a valid email." });
      return;
    }
    setStatus({ kind: "submitting" });
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, turnstileToken: token }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.message ?? `Request failed (${res.status})`);
      }
      setStatus({ kind: "success" });
      if (
        typeof window !== "undefined" &&
        Boolean((posthog as unknown as { __loaded?: boolean }).__loaded)
      ) {
        posthog.capture("waitlist_signup", { email_domain: email.split("@")[1] ?? null });
      }
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current);
        setToken(null);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong. Try again?";
      setStatus({ kind: "error", message });
    }
  }

  if (status.kind === "success") {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-bg)] p-4">
        <CheckCircle2
          aria-hidden="true"
          className="size-5 shrink-0 text-[color:var(--color-accent)]"
        />
        <p className="text-sm">
          You&apos;re on the list. Check your inbox for a quick hello.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor={emailId} className="sr-only">
          Email address
        </label>
        <input
          id={emailId}
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder="founder@yourstartup.com"
          className="flex-1 rounded-lg border border-[color:var(--color-border)] bg-transparent px-4 py-3 text-base outline-none transition focus:border-[color:var(--color-accent)] focus:ring-2 focus:ring-[color:var(--color-accent)]/30"
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
              Join the waitlist
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
    </form>
  );
}
