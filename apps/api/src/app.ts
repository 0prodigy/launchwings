// Hono app definition. Exported so both runtime targets can mount it:
//   - src/index.ts boots a Node server (local dev / future self-host).
//   - api/index.ts adapts it to Vercel Functions (production).
//
// instrumentation.ts must be imported BEFORE this module on the Node target so
// OTel auto-instrumentations patch http/pg before app.ts pulls them in. The
// Vercel target imports instrumentation in its own entrypoint for the same
// reason. Don't import instrumentation here — it would re-execute initOtel on
// every cold-start path that imports app.

import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { appRouter } from "@launchwings/trpc/router";
import { captureException } from "@launchwings/observability";
import { env } from "./env.js";
import { createContext } from "./context.js";
import { clerkMiddleware } from "./middleware/clerk.js";

export const app = new Hono();

app.use("*", logger());
app.use("*", secureHeaders());

app.use(
  "*",
  cors({
    origin: (origin) => (env.ALLOWED_ORIGINS.includes(origin) ? origin : null),
    credentials: true,
    allowHeaders: [
      "authorization",
      "content-type",
      "x-request-id",
      "x-test-tenant",
      "x-test-user",
    ],
  }),
);

app.use("*", clerkMiddleware);

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "@launchwings/api",
    gitSha: env.GIT_SHA,
    nodeEnv: env.NODE_ENV,
    ts: new Date().toISOString(),
  }),
);

app.get("/ready", (c) =>
  c.json({
    ok: true,
    service: "@launchwings/api",
    gitSha: env.GIT_SHA,
    ts: new Date().toISOString(),
  }),
);

app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    createContext,
    onError({ error, path }) {
      console.error(
        JSON.stringify({
          level: "error",
          source: "trpc",
          path,
          message: error.message,
          code: error.code,
        }),
      );
      captureException(error, { path, code: error.code });
    },
  }),
);

app.notFound((c) => c.json({ ok: false, message: "not_found" }, 404));

app.onError((err, c) => {
  console.error(
    JSON.stringify({
      level: "error",
      source: "hono",
      message: err instanceof Error ? err.message : String(err),
    }),
  );
  captureException(err);
  return c.json({ ok: false, message: "internal_error" }, 500);
});
