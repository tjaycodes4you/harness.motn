import { api, totalCost } from "./api"
import { appendJsonl } from "./evidence"

// Polls the server for the state the UI is supposed to be reflecting, so a
// failure can be attributed to the UI or to the server without re-running.
export function startJournal(name: string, sessionID: string, intervalMs = 2000) {
  let running = true
  const file = `${name}.api.jsonl`

  const pump = (async () => {
    while (running) {
      try {
        const [status, messages, todo] = await Promise.all([
          api.status(),
          api.messages(sessionID),
          api.todo(sessionID),
        ])
        appendJsonl(file, {
          at: Date.now(),
          status: status[sessionID]?.type ?? "idle",
          messages: messages.length,
          assistant: messages.filter((message) => message.info.role === "assistant").length,
          cost: totalCost(messages),
          todos: todo.map((item) => ({ content: item.content, status: item.status })),
        })
      } catch (error) {
        appendJsonl(file, { at: Date.now(), error: String(error) })
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
  })()

  return {
    stop: async () => {
      running = false
      await pump
    },
  }
}
