import { defineConfig } from "vitest/config";

// Minimal vitest config for @launchwings/api. Mirrors packages/agents so test
// invocation is consistent across the monorepo.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
  },
});
