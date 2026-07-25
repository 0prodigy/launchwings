// LRC-01 PR6 — optional DB persistence helper for marketing-side routes.
//
// Both /api/waitlist and /api/audit (anonymous) want to persist a row when a
// DATABASE_URL is available, but neither should hard-fail when it's not (or
// when the insert itself fails). This helper centralises:
//
//   1. The "is DB configured?" check — we don't want to import client-http and
//      have it eagerly throw on `requireUrl()` during a no-DB dev run.
//   2. The "log skip once per process" telemetry — so cold-start logs aren't
//      flooded with `db_persist_skipped` lines on every request.
//
// The dbHttp() client itself caches inside packages/db; we only construct it
// when DATABASE_URL is set, so the `requireUrl` throw is never reached on a
// no-DB boot.

import { dbHttp, type DbHttp } from "@launchwings/db";

const SKIP_LOG_KEY = "__lrc01_db_skip_logged";

type SkipState = { logged: Set<string> };

const skipState: SkipState =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ((globalThis as any)[SKIP_LOG_KEY] ??= { logged: new Set<string>() });

export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** Return a configured dbHttp() client, or null if DATABASE_URL is unset.
 *  Logs a structured-JSON `db_persist_skipped` exactly once per (source,
 *  process) so cold-start lines stay readable. */
export function getDbOrSkip(source: string): DbHttp | null {
  if (!isDbConfigured()) {
    if (!skipState.logged.has(source)) {
      skipState.logged.add(source);
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({
          level: "info",
          source,
          message: "db_persist_skipped",
          reason: "DATABASE_URL_unset",
        }),
      );
    }
    return null;
  }
  try {
    return dbHttp();
  } catch (err) {
    // dbHttp() should not throw when DATABASE_URL is set, but defensively log
    // and skip rather than crash the request.
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        level: "warn",
        source,
        message: "db_client_init_failed",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    return null;
  }
}
