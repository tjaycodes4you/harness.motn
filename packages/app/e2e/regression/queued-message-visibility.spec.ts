import { expect, test } from "@playwright/test"
import {
  assistantMessage,
  event,
  messageUpdated,
  sessionID,
  setupTimeline,
  textPart,
  userMessage,
} from "../performance/timeline-stability/fixture"

test("marks a follow-up queued while the previous turn still streams", async ({ page }) => {
  const timeline = await setupTimeline(page, {
    messages: [
      userMessage(undefined, { id: "msg_queued_first", created: 1700000000000 }),
      assistantMessage([textPart("prt_queued_streaming", "still streaming")], {
        id: "msg_queued_assistant",
        parentID: "msg_queued_first",
        created: 1700000001000,
        completed: false,
      }),
      userMessage(undefined, { id: "msg_queued_followup", created: 1700000002000 }),
    ],
  })
  await timeline.waitForPart("prt_queued_streaming")

  await expect(page.locator('[data-timeline-row="Queued"]')).toHaveCount(1)
  await expect(page.locator('[data-timeline-row="Thinking"]')).toHaveCount(0)
  await expect(
    page.locator('[data-timeline-row="UserMessage"][data-message-id="msg_queued_followup"]'),
  ).toContainText("Build the timeline stability matrix.")

  await timeline.send(
    messageUpdated(
      assistantMessage([textPart("prt_queued_answer", "answering now")], {
        id: "msg_queued_answer",
        parentID: "msg_queued_followup",
        created: 1700000003000,
        completed: false,
      }).info,
    ),
  )
  await timeline.send(
    event("message.part.updated", {
      sessionID,
      time: 1700000004000,
      part: { ...textPart("prt_queued_answer", "answering now"), sessionID, messageID: "msg_queued_answer" },
    }),
  )
  await timeline.waitForPart("prt_queued_answer")

  await expect(page.locator('[data-timeline-row="Queued"]')).toHaveCount(0)
})
