import { expect, test } from "@playwright/test"
import { setupTimeline } from "../performance/timeline-stability/fixture"

test("composer controls never overlap the send button at mobile width", async ({ page }) => {
  await setupTimeline(page, { viewport: { width: 390, height: 844 } })

  const result = await page.evaluate(() => {
    const form = document.querySelector('[data-component="prompt-input-v2"]')
    if (!form) return { error: "composer not found" }
    const buttons = [...form.querySelectorAll("button")]
      .map((button) => ({
        name: button.getAttribute("aria-label") ?? button.textContent ?? "",
        rect: button.getBoundingClientRect(),
      }))
      .filter((item) => item.rect.width > 0 && item.rect.height > 0)
    const pairs: [string, string, number, number][] = []
    for (let i = 0; i < buttons.length; i++) {
      for (let j = i + 1; j < buttons.length; j++) {
        const a = buttons[i].rect
        const b = buttons[j].rect
        const x = Math.min(a.right, b.right) - Math.max(a.left, b.left)
        const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
        if (x > 0.5 && y > 0.5) pairs.push([buttons[i].name, buttons[j].name, Math.round(x), Math.round(y)])
      }
    }
    const send = form.querySelector('[data-action="prompt-submit"]')?.getBoundingClientRect()
    return {
      pairs,
      viewport: window.innerWidth,
      sendRight: send ? Math.round(send.right) : null,
      sendLeft: send ? Math.round(send.left) : null,
    }
  })

  expect(result.error).toBeUndefined()
  expect(result.pairs).toEqual([])
  expect(result.sendRight).not.toBeNull()
  expect(result.sendLeft! >= 0 && result.sendRight! <= result.viewport).toBe(true)
})
