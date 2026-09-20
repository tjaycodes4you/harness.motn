import { defineConfig, devices } from "@playwright/test"

// Site smoke config: runs against a *deployed* harness over HTTP Basic auth.
// No webServer — it points at a real URL. Configure via env:
//   SITE_BASE_URL  (default https://harness.motionlabs.ng)
//   SITE_USER      (default "opencode")
//   SITE_PASSWORD  (required)
const baseURL = process.env.SITE_BASE_URL ?? "https://harness.motionlabs.ng"
const username = process.env.SITE_USER ?? "opencode"
const password = process.env.SITE_PASSWORD ?? ""

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  testIgnore: ["**/test-results/**"],
  outputDir: "./test-results",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL,
    httpCredentials: password ? { username, password } : undefined,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
})
