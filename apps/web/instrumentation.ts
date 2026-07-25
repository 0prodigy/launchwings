// Next 15 instrumentation hook. Runs once per server runtime (nodejs / edge).
// We only initialise OTel + Sentry-server in the Node runtime — the edge build
// can't load the Node OTel SDK, and Sentry's Next package handles edge
// separately via sentry.edge.config.ts (deferred; we don't ship that yet).
//
// Bail-graceful: missing env vars produce a single warn line and a no-op.

import { initOtel, initSentry } from "@launchwings/observability";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  await initOtel({
    serviceName: "@launchwings/web",
    serviceVersion:
      process.env.SERVICE_VERSION ??
      process.env.VERCEL_GIT_COMMIT_SHA ??
      "dev",
  });

  await initSentry({
    dsn: process.env.SENTRY_DSN,
    env: process.env.NODE_ENV,
    release:
      process.env.SERVICE_VERSION ??
      process.env.VERCEL_GIT_COMMIT_SHA ??
      undefined,
    serviceName: "@launchwings/web",
  });
}
