import { defineConfig, devices } from "@playwright/test"

// Deployed-site config: runs against a *deployed* harness over HTTP Basic auth.
// No webServer — it points at a real URL. Configure via env:
//   LIVE_TIER      hermetic | staging | live (default staging)
//   SITE_BASE_URL  explicit target URL (overrides the tier's URL)
//   SITE_USER      default "opencode"
//   SITE_PASSWORD  required for staging/live
//   LIVE_EVIDENCE_DIR  where report.json/build.json/artifacts land (set by live-test.cmd)
const tierURLs: Record<string, string> = {
  hermetic: "http://127.0.0.1:4098",
  staging: "https://test-harness.motionlabs.ng",
  live: "https://harness.motionlabs.ng",
}
const baseURL = process.env.SITE_BASE_URL ?? tierURLs[process.env.LIVE_TIER ?? "staging"]
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
  // Model-calling scenarios are probabilistic; one retry lets the reporter label
  // a recovery as FLAKE instead of FAIL (see support/reporter.ts).
  retries: process.env.LIVE_RETRIES ? Number(process.env.LIVE_RETRIES) : 1,
  reporter: [["list"], ["./support/reporter.ts"]],
  use: {
    baseURL,
    httpCredentials: password ? { username, password } : undefined,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
})
