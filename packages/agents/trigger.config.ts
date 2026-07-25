import { defineConfig } from "@trigger.dev/sdk";

// Trigger.dev v3 project config. The project ref is created by the founder in
// the trigger.dev dashboard once and pasted into the TRIGGER_PROJECT_REF env
// var (see SETUP-04 ticket + this package's README). Until that lands the ref
// resolves to a placeholder string; `trigger.dev deploy` is the only command
// that consults this file at runtime, and CI bails before invoking it when the
// secret is unset.
//
// Conventions:
// - dirs lists ./src/tasks and ./src/crons explicitly — pointing at ./src
//   broadly pulled __tests__/*.eval.ts into the deploy bundle and broke
//   esbuild on the eval-only fixtures.
// - retries enabled in dev so the runtime path matches prod (catches retry
//   handler bugs locally, per SETUP-04 acceptance "retry policy: 3 attempts").
// - Build runtime stays node (default); we explicitly avoid the bun runtime
//   because @launchwings/db pulls node-postgres which has native bindings.
// - @browserbasehq/sdk + playwright-core are externalised because both
//   read `../../../package.json` at runtime via require() to introspect
//   their own version. esbuild's deploy bundle relocates the call sites
//   and the relative path no longer points at the package, so module
//   loading fails on the worker. Marking them external leaves the
//   require()s as-is and trigger.dev's worker container resolves them
//   from node_modules. (chromium-bidi is also a transitive runtime peer
//   of playwright; it's already installed as a direct dep of this package
//   to satisfy esbuild's resolution at deploy time.)
export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "proj_placeholder_set_TRIGGER_PROJECT_REF",
  runtime: "node",
  dirs: ["./src/tasks", "./src/crons"],
  build: {
    external: ["@browserbasehq/sdk", "playwright-core", "playwright"],
  },
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      factor: 2,
      minTimeoutInMs: 1_000,
      maxTimeoutInMs: 30_000,
      randomize: true,
    },
  },
  logLevel: "log",
  // 5-min default; helloAgent itself completes in <2s, but cron + future
  // LRC-01 fan-out will need headroom. Override per-task when needed.
  maxDuration: 300,
});
