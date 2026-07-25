// Telemetry boot. MUST be the first import in src/index.ts so OTel's
// auto-instrumentations patch http/pg/etc. before any of those modules are
// loaded by the rest of the app. If this file ever stops being the first
// import, traces will silently lose spans.
//
// Both initializers are graceful-degrade: missing env → single warn line, no
// crash. Production observability is opt-in, enabled by setting the relevant
// env vars on Fly.

import { initOtel, initSentry } from "@launchwings/observability";
import { env } from "./env.js";

await initOtel({
  serviceName: "@launchwings/api",
  serviceVersion: env.SERVICE_VERSION ?? env.GIT_SHA,
});

await initSentry({
  dsn: env.SENTRY_DSN,
  env: env.NODE_ENV,
  release: env.SERVICE_VERSION ?? env.GIT_SHA,
  serviceName: "@launchwings/api",
});
