// Node.js server bootstrap (local dev + any future self-host target). The
// production deploy target is Vercel Functions, which adapts the same `app`
// via api/index.ts; do not consolidate the two without checking that
// instrumentation still loads first on both paths.
import "./instrumentation.js";

import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { env } from "./env.js";

serve(
  {
    fetch: app.fetch,
    port: env.PORT,
    hostname: "0.0.0.0",
  },
  (info) => {
    console.log(
      JSON.stringify({
        level: "info",
        source: "boot",
        message: `@launchwings/api listening on ${info.address}:${info.port}`,
        gitSha: env.GIT_SHA,
        nodeEnv: env.NODE_ENV,
      }),
    );
  },
);
