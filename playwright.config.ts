import { defineConfig, devices } from "@playwright/test";

// Smoke tests at iPhone size. Point E2E_BASE_URL at a dev or preview deployment
// and give a dedicated test account (its own home) in E2E_EMAIL / E2E_PASSWORD.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1,
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", trace: "retain-on-failure" },
  projects: [{ name: "iphone", use: { ...devices["iPhone 14"], browserName: "chromium" } }],
  webServer: process.env.E2E_BASE_URL ? undefined : { command: "npm run dev", url: "http://localhost:3000/login", reuseExistingServer: true, timeout: 120_000 },
});
