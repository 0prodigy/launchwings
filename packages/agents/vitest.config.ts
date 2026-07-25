import { defineConfig } from "vitest/config";

// Minimal vitest config for @launchwings/agents.
// - Default LLM_CASSETTE_MODE is "replay" so CI runs without API keys.
// - Tests run in node environment (we don't need jsdom).
// - No coverage gate yet; SETUP-12 will introduce one for evaluators.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
    env: {
      // Override per-test if a test wants record mode locally. CI will keep
      // this default and never see real API keys.
      LLM_CASSETTE_MODE: "replay",
    },
  },
});
