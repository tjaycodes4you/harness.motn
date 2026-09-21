import { expect, test } from "@playwright/test"
import { api, totalCost } from "../support/api"
import { openSession, submitPrompt, waitForAssistantTurn, waitForComposerReady, waitForPromptAdmitted } from "../support/composer"
import { dockSnapshot, readDockSamples, startDockSampler } from "../support/dock"
import { slug, writeJson, writeText } from "../support/evidence"
import { budgetUSD, fixtureTitle, keepSessions, modelAllowed } from "../support/env"
import { startJournal } from "../support/journal"

// Regression scenario for the "the todo doesn't work" report (2026-09-21): the
// dock must stay visible while the list has unfinished items, including after
// the turn ends and when the session is reopened.
const PROMPT =
  "Call the todowrite tool first: create exactly two todos, alpha and beta, both pending. " +
  "Then call todowrite again and set alpha to in_progress. Then reply with the single word: done"

let sessionID: string | undefined

test.afterEach(async () => {
  if (!sessionID) return
  if (keepSessions() || test.info().status !== "passed") {
    writeJson(`${slug(test.info().title)}.session.json`, { sessionID, kept: true })
    return
  }
  await api.deleteSession(sessionID)
})

test("todo dock appears while the turn is live @scenario @model", async ({ page, baseURL }) => {
  test.skip(!modelAllowed(), "model scenarios are disabled on live (set LIVE_ALLOW_LIVE_MODEL=1)")
  test.setTimeout(300_000)

  const name = slug(test.info().title)
  const title = fixtureTitle("todo-dock")
  const session = await api.createSession(title)
  sessionID = session.id

  const journal = startJournal(name, session.id)
  try {
    await openSession(page, session.id, baseURL)
    await startDockSampler(page)
    await submitPrompt(page, PROMPT)

    await waitForPromptAdmitted(session.id, PROMPT)
    const { messages } = await waitForAssistantTurn(session.id)
    await page.waitForTimeout(1500)

    const todos = await api.todo(session.id)
    const samples = await readDockSamples(page)
    const dockSeen = samples.filter((sample) => sample.present)
    const observedStates = Array.from(new Set(dockSeen.flatMap((sample) => sample.states)))
    const afterIdle = await dockSnapshot(page)

    await page.reload({ waitUntil: "domcontentloaded" })
    await waitForComposerReady(page)
    await page.waitForTimeout(2000)
    const afterReload = await dockSnapshot(page)

    writeJson(`${name}.todos.json`, {
      sessionID: session.id,
      title,
      todos,
      cost: totalCost(messages),
      budget: budgetUSD(),
      dockSamples: samples.length,
      dockFrames: dockSeen.length,
      dockStates: observedStates,
      dockAfterIdle: afterIdle,
      dockAfterReload: afterReload,
      sampleAt: new Date().toISOString(),
    })

    writeText(
      `${name}.finding.md`,
      [
        `# todo-dock finding (${new Date().toISOString()})`,
        "",
        `- session: \`${session.id}\` (title \`${title}\`)`,
        `- server todos: ${todos.length} (${todos.map((todo) => `${todo.content}:${todo.status}`).join(", ") || "none"})`,
        `- dock frames while live: ${dockSeen.length} / ${samples.length}`,
        `- dock states observed: ${observedStates.join(", ") || "none"}`,
        `- dock after idle: present=${afterIdle.present} states=${afterIdle.states.join(", ") || "none"}`,
        `- dock after reload: present=${afterReload.present} states=${afterReload.states.join(", ") || "none"}`,
        "",
        "Expected: the dock stays visible while the list has pending/in_progress",
        "items and closes only once every todo is completed or cancelled.",
      ].join("\n"),
    )

    expect(todos.length, "model must create todos via todowrite").toBeGreaterThan(0)
    expect(
      todos.some((todo) => todo.status === "in_progress" || todo.status === "pending"),
      "the list must not be fully completed for the dock to be expected",
    ).toBe(true)
    expect(dockSeen.length, "dock must render at least once while the turn is live").toBeGreaterThan(0)
    expect(afterIdle.present, "dock must stay while todos are unfinished").toBe(true)
    expect(afterIdle.states).toContain("in_progress")
    expect(afterReload.present, "dock must render when the idle session is reopened").toBe(true)
    expect(afterReload.states).toContain("in_progress")
    expect(totalCost(messages), "scenario must stay within budget").toBeLessThanOrEqual(budgetUSD())
  } finally {
    await journal.stop()
  }
})
