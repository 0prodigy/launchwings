// Tiny structured-log helper. Every call site across the monorepo emits a
// single-line JSON object so Axiom (or whatever log sink) can ingest without
// per-app parsers. Keep the field set boring and stable: `level`, `source`,
// `message`, plus arbitrary structured fields. No timestamps — the sink stamps
// arrival time and Vercel/Fly stamp emit time at the stdout boundary.

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogEvent = {
  level: LogLevel;
  source: string;
  message: string;
  // Arbitrary structured fields. Avoid putting raw user input here without
  // redaction — PII redaction is a separate middleware (SETUP-06 follow-up).
  [key: string]: unknown;
};

export function logEvent(event: LogEvent): void {
  const payload = JSON.stringify(event);
  // Route warn/error to stderr so process supervisors (Fly, Vercel) classify
  // correctly. Everything else goes to stdout.
  if (event.level === "error" || event.level === "warn") {
    // eslint-disable-next-line no-console
    console.error(payload);
  } else {
    // eslint-disable-next-line no-console
    console.log(payload);
  }
}
