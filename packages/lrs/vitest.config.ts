import { defineConfig } from "vitest/config";

// LRS evaluator vitest config. PR1 ships:
// - meta-description (pure HTML parse — no network)
// - og-image (network HEAD; tests stub global fetch)
//
// runner.test.ts runs the parallel runner against an in-memory persistence
// shim (persistResults: false) so we don't require Postgres in CI. When LRC-01
// PR2 adds persistence-coverage tests we'll spin a transactional Neon branch
// and switch on persistResults.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
  },
});
