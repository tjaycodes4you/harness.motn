import { expect, test, type Page } from "@playwright/test"
import { appErrors, sessionHref, trackErrors } from "./support/app"

// Fixture session known to contain reasoning parts; override with LIVE_SESSION_REASONING.
const REASONING_SESSION = process.env.LIVE_SESSION_REASONING ?? process.env.SITE_REASONING_SESSION ?? "ses_01bd8d72fffec8lCoY29BUsNM3"
// Fixture session whose assistant turn produced no output (empty parts, 0 tokens).
const NO_RESPONSE_SESSION =
  process.env.LIVE_SESSION_NO_RESPONSE ?? process.env.SITE_NO_RESPONSE_SESSION ?? "ses_f4571d8a5ffeHmWaiFEq4fiiqd"
// A term expected to appear in at least one session title on any harness DB.
const SEARCH_QUERY = process.env.LIVE_SEARCH_QUERY ?? process.env.SITE_SEARCH_QUERY ?? "opencode"

// The timeline virtualizes and auto-scrolls to the latest message; older rows
// (where empty turns live) are unmounted until scrolled into view. Wheel up like
// a real user (programmatic scrollTop is overridden by auto-scroll).
async function revealNoResponse(page: Page) {
  const row = page.locator('[data-slot="session-turn-no-response"]')
  await page.waitForTimeout(4000)
  for (let i = 0; i < 80; i++) {
    if ((await row.count()) > 0) return
    await page.mouse.move(640, 400)
    await page.mouse.wheel(0, -1500)
    await page.waitForTimeout(120)
  }
}

test.describe("site smoke", () => {
  test("home renders with motn title and no console errors @smoke", async ({ page }) => {
    const errors = trackErrors(page)
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await expect(page).toHaveTitle(/motn/i)
    await expect(page.locator("#root")).toBeVisible()
    await page.waitForTimeout(4000)
    expect(appErrors(errors)).toEqual([])
  })

  test("home lists sessions and searches across all projects @smoke", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" })

    const rows = page.locator('[data-component="home-session-row"]')
    await expect(rows.first()).toBeVisible({ timeout: 30_000 })
    expect(await rows.count(), "home should list recent sessions without adding a project").toBeGreaterThan(0)

    const search = page.locator('input[placeholder*="Search sessions"]')
    await search.click()
    await search.fill(SEARCH_QUERY)
    const results = page.locator('[data-component="home-session-search-row"]')
    await expect(results.first()).toBeVisible({ timeout: 30_000 })
    expect(await results.count(), "server-side search should match sessions from every project").toBeGreaterThan(0)
  })

  test("home exposes new-project and settings exposes session sync @smoke", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" })
    await expect(page.locator('[data-action="home-new-project"]').first()).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-action="home-add-project"]').first()).toBeVisible({ timeout: 30_000 })

    await page.getByText("Settings", { exact: true }).first().click()
    await expect(page.locator('[data-action="settings-motn-sync"]').first()).toBeVisible({ timeout: 30_000 })
  })

  test("known reasoning session renders a Thinking trace @smoke", async ({ page, baseURL }) => {
    const errors = trackErrors(page)
    await page.goto(sessionHref(REASONING_SESSION, baseURL), { waitUntil: "domcontentloaded" })
    await expect(page.getByText("session cannot be found", { exact: false })).toHaveCount(0)

    const thinking = page.getByText("Thinking", { exact: true }).first()
    await expect(thinking).toBeVisible({ timeout: 30_000 })

    const before = (await page.innerText("body")).length
    await thinking.click()
    await page.waitForTimeout(1500)
    const after = (await page.innerText("body")).length
    expect(after, "expanding Thinking should reveal more text").toBeGreaterThan(before)

    expect(appErrors(errors)).toEqual([])
  })

  test("empty assistant turn shows a No response state with Retry @smoke", async ({ page, baseURL }) => {
    await page.goto(sessionHref(NO_RESPONSE_SESSION, baseURL), { waitUntil: "domcontentloaded" })
    await expect(page.getByText("session cannot be found", { exact: false })).toHaveCount(0)
    await revealNoResponse(page)

    const row = page.locator('[data-slot="session-turn-no-response"]').first()
    await expect(row).toBeVisible({ timeout: 30_000 })
    await expect(row.getByText("No response was generated.")).toBeVisible()
    await expect(row.getByRole("button", { name: "Retry" })).toBeVisible()
  })

  test("auth gate: 401 without creds, 200 with @smoke", async ({ baseURL }) => {
    const anon = await fetch(`${baseURL}/config`)
    expect(anon.status, "no creds must be rejected").toBe(401)

    const token = Buffer.from(`${process.env.SITE_USER ?? "opencode"}:${process.env.SITE_PASSWORD ?? ""}`).toString(
      "base64",
    )
    const authed = await fetch(`${baseURL}/config`, { headers: { authorization: `Basic ${token}` } })
    expect(authed.status, "valid creds must be accepted").toBe(200)
  })
})
