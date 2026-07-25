import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// LRC-04 — vitest config for pure-function tests in apps/web (no React, no
// jsdom). Aliases the `@/` alias the way tsconfig + Next do so test imports
// match runtime imports.
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "./"),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/__tests__/**/*.test.ts"],
  },
});
