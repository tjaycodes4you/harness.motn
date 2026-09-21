import { expect, test } from "@playwright/test"
import { api, totalCost } from "../support/api"
import { openSession, submitPrompt, waitForAssistantTurn, waitForPromptAdmitted } from "../support/composer"
import { slug, writeJson } from "../support/evidence"
import { budgetUSD, fixtureTitle, keepSessions, modelAllowed } from "../support/env"
import { startJournal } from "../support/journal"

const PROMPT = "Reply with exactly this and nothing else: livetest-ok"

let sessionID: string | undefined

test.afterEach(async () => {
  if (!sessionID) return
  if (keepSessions() || test.info().status !== "passed") {
    writeJson(`${slug(test.info().title)}.session.json`, { sessionID, kept: true })
    return
  }
  await api.deleteSession(sessionID)
})

test("prompt is admitted and the assistant turn completes @scenario @model", async ({ page, baseURL }) => {
  test.skip(!modelAllowed(), "model scenarios are disabled on live (set LIVE_ALLOW_LIVE_MODEL=1)")
  test.setTimeout(300_000)

  const name = slug(test.info().title)
  const title = fixtureTitle("turn-lifecycle")
  const session = await api.createSession(title)
  sessionID = session.id

  const journal = startJournal(name, session.id)
  try {
    await openSession(page, session.id, baseURL)
    await submitPrompt(page, PROMPT)

    await waitForPromptAdmitted(session.id, PROMPT)
    const { messages, assistant } = await waitForAssistantTurn(session.id)

    const text = assistant.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text ?? "")
      .join("")
    const cost = totalCost(messages)

    await expect(page.getByText(text.slice(0, 40), { exact: false }).first()).toBeVisible({ timeout: 30_000 })

    writeJson(`${name}.result.json`, {
      sessionID: session.id,
      title,
      assistantMessageID: assistant.info.id,
      text: text.slice(0, 500),
      cost,
      budget: budgetUSD(),
      messages: messages.length,
    })

    expect(text.trim().length, "assistant turn must produce text").toBeGreaterThan(0)
    expect(cost, "scenario must stay within budget").toBeLessThanOrEqual(budgetUSD())
  } finally {
    await journal.stop()
  }
})
