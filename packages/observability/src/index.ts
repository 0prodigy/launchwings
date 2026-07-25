// Public surface of @launchwings/observability. Subpath exports
// (./otel, ./sentry, ./log, ./span, ./env) are also available for callers that
// want to tree-shake or avoid pulling unused initializers into their bundle.

export { initOtel, isOtelStarted } from "./otel";
export { initSentry, isSentryStarted, captureException } from "./sentry";
export { logEvent } from "./log";
export type { LogLevel, LogEvent } from "./log";
export { withSpan } from "./span";
export type { SpanAttributes } from "./span";
export type { ObservabilityEnv } from "./env";
