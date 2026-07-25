// Shape of every observability-relevant env var any LaunchWings runtime might
// set. All optional — initOtel/initSentry no-op (with a single-line JSON warn)
// when the matching keys are missing, so booting without telemetry stays safe.
//
// Where each var is set, in practice:
//   OTEL_EXPORTER_OTLP_ENDPOINT  — Axiom OTLP HTTP endpoint (api.axiom.co/v1/traces).
//   OTEL_EXPORTER_OTLP_HEADERS   — Axiom auth + dataset headers, e.g.
//                                  "Authorization=Bearer xaat-...,X-Axiom-Dataset=launchwings".
//   AXIOM_TOKEN, AXIOM_DATASET   — alternative split form; we still emit traces
//                                  via the OTLP exporter using whichever pair exists.
//   SENTRY_DSN                   — Sentry project DSN.
//   SERVICE_NAME, SERVICE_VERSION — overrides the resource attributes attached
//                                  to spans + Sentry releases. Defaults supplied
//                                  by each app's instrumentation entrypoint.
export type ObservabilityEnv = {
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;
  OTEL_EXPORTER_OTLP_HEADERS?: string;
  AXIOM_TOKEN?: string;
  AXIOM_DATASET?: string;
  SENTRY_DSN?: string;
  SERVICE_NAME?: string;
  SERVICE_VERSION?: string;
};
