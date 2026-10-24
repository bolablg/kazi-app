import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:5175",
    trace: "retain-on-failure",
    channel: process.env.KAZI_TEST_BROWSER,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run dev:demo",
      url: "http://127.0.0.1:5175",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run preview",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
