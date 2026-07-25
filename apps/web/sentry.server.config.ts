// Sentry Node-runtime init for the Next server. `@sentry/nextjs` auto-loads
// this in the nodejs runtime. Edge runtime gets its own sentry.edge.config.ts
// when we need it — deferred until we add edge routes.

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    release: process.env.SERVICE_VERSION ?? process.env.VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: 0.1,
  });
}
