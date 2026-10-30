import { defineConfig, devices } from "@playwright/test";

// Browser tests at iPhone size. By default they need nothing: Playwright starts
// a stand-in Supabase (the migrated in-memory test database, e2e/fake-supabase.ts)
// and the app on :3100 wired to it, and each test makes its own throwaway home.
// To test a real deployment instead, set E2E_BASE_URL plus a dedicated account
// in E2E_EMAIL / E2E_PASSWORD.
const real = !!process.env.E2E_BASE_URL;
const FAKE = "http://localhost:54329";
const APP = "http://localhost:3100";
const key = (role: string) => {
  const b = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b({ alg: "HS256", typ: "JWT" })}.${b({ role, iss: "fake-supabase", exp: 4102444800 })}.sig`;
};

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1,
  use: { baseURL: process.env.E2E_BASE_URL ?? APP, trace: "retain-on-failure" },
  projects: [{ name: "iphone", use: { ...devices["iPhone 14"], browserName: "chromium" } }],
  webServer: real
    ? undefined
    : [
        { command: "node node_modules/jiti/lib/jiti-cli.mjs e2e/fake-supabase.ts", url: `${FAKE}/__test/health`, reuseExistingServer: !process.env.CI, timeout: 120_000 },
        {
          command: "npx next dev -p 3100",
          url: `${APP}/login`,
          reuseExistingServer: !process.env.CI,
          timeout: 240_000,
          env: {
            NEXT_PUBLIC_SUPABASE_URL: FAKE,
            NEXT_PUBLIC_SUPABASE_ANON_KEY: key("anon"),
            SUPABASE_SERVICE_ROLE_KEY: key("service_role"),
            NEXT_PUBLIC_APP_URL: APP,
            // Nothing outward-facing from a test run.
            RESEND_API_KEY: "",
            GEMINI_API_KEY: "",
            GOOGLE_CLIENT_ID: "",
            GOOGLE_CLIENT_SECRET: "",
            VAPID_PRIVATE_KEY: "",
            CRON_SECRET: "e2e-cron",
            NODE_OPTIONS: "--dns-result-order=ipv4first",
          },
        },
      ],
});
