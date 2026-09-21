import { expect, type Page } from "@playwright/test"
import { api, waitIdle } from "./api"
import { sessionHref } from "./app"

export async function openSession(page: Page, sessionID: string, baseURL: string | undefined) {
  await page.goto(sessionHref(sessionID, baseURL), { waitUntil: "domcontentloaded" })
  await expect(page.locator('[data-component="prompt-input"]').first()).toBeVisible({ timeout: 30_000 })
}

export async function submitPrompt(page: Page, text: string) {
  const input = page.locator('[data-component="prompt-input"]').first()
  await input.click()
  await input.fill(text)
  await page.keyboard.press("Enter")
}

// Ground truth for "the prompt was admitted": the server must expose a user
// message with this text before any UI assertion is trusted.
export async function waitForPromptAdmitted(sessionID: string, text: string, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const found = (await api.messages(sessionID)).find(
      (message) =>
        message.info.role === "user" &&
        message.parts.some((part) => part.type === "text" && (part.text ?? "").includes(text)),
    )
    if (found) return found
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`prompt was never admitted into session ${sessionID}`)
}

export async function waitForAssistantTurn(sessionID: string, timeoutMs = 180_000) {
  await waitIdle(sessionID, timeoutMs)
  const messages = await api.messages(sessionID)
  const assistant = messages.filter((message) => message.info.role === "assistant").at(-1)
  if (!assistant) throw new Error(`no assistant turn in session ${sessionID}`)
  return { messages, assistant }
}
