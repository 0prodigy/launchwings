// Sentry initializer for the Node runtime (api + Next server). Browser-side
// init for the web app goes through `@sentry/nextjs`'s `sentry.client.config.ts`
// convention — we don't ship `@sentry/browser` here.
//
// Bail-graceful contract: missing DSN → no-op + single warn line. Never crash.

import { logEvent } from "./log";

export type InitSentryOptions = {
  dsn: string | undefined;
  env?: string;
  release?: string;
  // Sample rates default to conservative production values; callers can
  // override per-environment.
  tracesSampleRate?: number;
  // Service identifier shows up as a tag for cross-service filtering.
  serviceName?: string;
};

let _started = false;
type SentryNode = typeof import("@sentry/node");
let _sentry: SentryNode | null = null;

export async function initSentry(options: InitSentryOptions): Promise<void> {
  if (_started) return;
  if (!options.dsn) {
    logEvent({
      level: "warn",
      source: "observability.sentry",
      message: "Sentry disabled — SENTRY_DSN not set.",
      service: options.serviceName,
    });
    return;
  }

  try {
    // Dynamic import so the dependency is only resolved when actually enabled.
    // `webpackIgnore` keeps Next's bundler out of the @sentry/node graph at
    // build time — Node loads it at runtime when the DSN is set.
    const Sentry = await import(
      /* webpackIgnore: true */ "@sentry/node"
    );
    Sentry.init({
      dsn: options.dsn,
      environment: options.env,
      release: options.release,
      tracesSampleRate: options.tracesSampleRate ?? 0.1,
      // We rely on OTel auto-instrumentations for spans; Sentry's default
      // integrations stay on for error capture.
    });
    if (options.serviceName) {
      Sentry.setTag("service", options.serviceName);
    }
    _sentry = Sentry;
    _started = true;
    logEvent({
      level: "info",
      source: "observability.sentry",
      message: "Sentry initialized",
      service: options.serviceName,
      env: options.env,
      release: options.release,
    });
  } catch (err) {
    logEvent({
      level: "warn",
      source: "observability.sentry",
      message: "Sentry init failed; continuing without error capture",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function isSentryStarted(): boolean {
  return _started;
}

// Best-effort capture: callers can fire this from any error path; if Sentry
// isn't initialized it's a no-op. Keeps call sites unconditional.
export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!_started || !_sentry) return;
  try {
    if (context) {
      _sentry.withScope((scope) => {
        for (const [k, v] of Object.entries(context)) {
          scope.setExtra(k, v);
        }
        _sentry!.captureException(error);
      });
    } else {
      _sentry.captureException(error);
    }
  } catch {
    // Swallow — never let telemetry rethrow into the caller's error path.
  }
}
