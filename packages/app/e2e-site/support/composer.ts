import { expect, type Page } from "@playwright/test"
import { api, waitIdle } from "./api"
import { sessionHref } from "./app"

export async function openSession(page: Page, sessionID: string, baseURL: string | undefined) {
  await page.goto(sessionHref(sessionID, baseURL), { waitUntil: "domcontentloaded" })
  await expect(page.locator('[data-component="prompt-input"]').first()).toBeVisible({ timeout: 30_000 })
}

// The composer renders before the app resolves its model/agent selection
// (prompt-input/submit.ts bails when either is undefined), so a submit before
// the model chip carries a label is silently dropped.
export async function waitForComposerReady(page: Page) {
  const chip = page.locator('[data-action="prompt-model"]').first()
  await expect(chip).toBeVisible({ timeout: 30_000 })
  await expect(chip).toHaveText(/\S/, { timeout: 30_000 })
}

export async function submitPrompt(page: Page, text: string) {
  await waitForComposerReady(page)
  const input = page.locator('[data-component="prompt-input"]').first()
  await input.click()
  // fill() commits text without the app's editor noticing; typing does.
  await input.pressSequentially(text, { delay: 10 })
  const draft = text.slice(0, Math.min(16, text.length))
  await expect(input).toContainText(draft, { timeout: 10_000 })
  // The submit button enables reactively as the draft lands; clicking before
  // that silently does nothing.
  const submit = page.locator('[data-action="prompt-submit"]').first()
  await expect(submit).toBeEnabled({ timeout: 10_000 })
  await submit.click()
  // The composer clears its draft only when the submit was accepted.
  await expect(input).not.toContainText(draft, { timeout: 15_000 })
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
