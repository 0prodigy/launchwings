import { defineConfig } from "vitest/config";

// LRC-04 — pure-function generator tests live here. Node env, no jsdom; the
// trpc generators are deliberately renderer-free so they can run in any env.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
  },
});
