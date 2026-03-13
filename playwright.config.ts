import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: false,
  outputDir: "output/playwright/test-results",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm --filter web exec next dev -p 3000",
    port: 3000,
    reuseExistingServer: false,
    env: {
      NEXT_PUBLIC_ENABLE_DEMO_MODE: "true",
      NEXT_PUBLIC_API_BASE_URL: "",
      NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "",
    },
  },
});
