import { defineConfig, devices } from "@playwright/test";

// Minimal Playwright config for SETUP-07 preview-URL smoke. We do NOT run a
// dev server here — the smoke job points PLAYWRIGHT_BASE_URL at an already-
// deployed preview (or live prod when run locally for sanity-checking).
//
// Default base URL is the live site so `pnpm test:smoke` is useful even
// without setting an env var (e.g., for local dogfood after a deploy).

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "https://launchwings.com";

export default defineConfig({
  testDir: "./__tests__",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    headless: true,
    ignoreHTTPSErrors: false,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
