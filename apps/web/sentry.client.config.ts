// Sentry browser-side init. `@sentry/nextjs` auto-loads this file in client
// bundles. Gated on NEXT_PUBLIC_SENTRY_DSN — without it we no-op so previews
// and local dev don't ship to a Sentry project.

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
    release:
      process.env.NEXT_PUBLIC_SERVICE_VERSION ??
      process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}
