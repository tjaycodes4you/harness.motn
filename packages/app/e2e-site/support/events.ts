import { authHeaders } from "./env"
import { appendJsonl } from "./evidence"
import { baseURL } from "./env"

export type EventJournal = {
  stop: () => Promise<void>
  count: () => number
}

// Journals every event the target emits while a scenario runs. The app streams
// events over fetch (no EventSource), so this reads the same SSE feed from the
// test process instead of from the browser.
export function captureEvents(name: string): EventJournal {
  const controller = new AbortController()
  let seen = 0
  const file = `${name}.sse.jsonl`

  const started = (async () => {
    try {
      const response = await fetch(`${baseURL()}/event`, {
        headers: { ...authHeaders(), accept: "text/event-stream" },
        signal: controller.signal,
      })
      if (!response.ok || !response.body) throw new Error(`event stream -> ${response.status}`)
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const frames = buffer.split("\n\n")
        buffer = frames.pop() ?? ""
        for (const frame of frames) {
          const data = frame
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim())
            .join("")
          if (!data) continue
          seen++
          try {
            const parsed = JSON.parse(data) as { type: string; properties: unknown }
            appendJsonl(file, { at: Date.now(), type: parsed.type, properties: parsed.properties })
          } catch {
            appendJsonl(file, { at: Date.now(), raw: data.slice(0, 500) })
          }
        }
      }
    } catch (error) {
      if (controller.signal.aborted) return
      appendJsonl(file, { at: Date.now(), error: String(error) })
    }
  })()

  return {
    stop: async () => {
      controller.abort()
      await started
    },
    count: () => seen,
  }
}
