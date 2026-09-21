import type { Page } from "@playwright/test"

export type DockSample = { t: number; present: boolean; states: string[] }
export type DockSnapshot = { present: boolean; states: string[] }

type SamplerWindow = { __livetestSamples?: DockSample[] }

// Samples the todo dock on every animation frame, in-page, so a dock that only
// exists mid-turn is still observed. Stops after durationMs or when stopped.
export async function startDockSampler(page: Page, durationMs = 300_000) {
  await page.evaluate((limit) => {
    const target = window as unknown as SamplerWindow
    target.__livetestSamples = []
    const started = performance.now()
    const tick = () => {
      const dock = document.querySelector('[data-component="session-todo-dock"]')
      target.__livetestSamples!.push({
        t: Math.round(performance.now() - started),
        present: !!dock,
        states: Array.from(dock?.querySelectorAll("[data-state]") ?? []).map(
          (element) => element.getAttribute("data-state") ?? "",
        ),
      })
      if (performance.now() - started < limit) requestAnimationFrame(tick)
    }
    tick()
  }, durationMs)
}

export async function readDockSamples(page: Page) {
  return page.evaluate(() => (window as unknown as SamplerWindow).__livetestSamples ?? [])
}

export async function dockSnapshot(page: Page): Promise<DockSnapshot> {
  return page.evaluate(() => {
    const dock = document.querySelector('[data-component="session-todo-dock"]')
    return {
      present: !!dock,
      states: Array.from(dock?.querySelectorAll("[data-state]") ?? []).map(
        (element) => element.getAttribute("data-state") ?? "",
      ),
    }
  })
}
