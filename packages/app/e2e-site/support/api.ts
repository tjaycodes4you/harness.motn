import { authHeaders, baseURL, directory } from "./env"

export type Todo = { content: string; status: string; priority: string }
export type SessionInfo = { id: string; directory?: string; title?: string }
export type MessageInfo = {
  id: string
  role: string
  cost?: number
  time?: { created?: number; completed?: number }
}
export type MessageWithParts = { info: MessageInfo; parts: { type: string; text?: string }[] }

async function call<T>(method: string, route: string, body?: unknown): Promise<T> {
  const response = await fetch(`${baseURL()}${route}`, {
    method,
    headers: {
      ...authHeaders(),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(directory() ? { "x-opencode-directory": directory()! } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`${method} ${route} -> ${response.status} ${await response.text()}`)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export const api = {
  health: () => call<{ healthy: boolean; version: string }>("GET", "/global/health"),
  config: () => call<Record<string, unknown>>("GET", "/config"),
  listSessions: () => call<SessionInfo[]>("GET", "/session"),
  createSession: (title: string) => call<SessionInfo>("POST", "/session", { title }),
  deleteSession: (sessionID: string) => call<boolean>("DELETE", `/session/${sessionID}`),
  status: () => call<Record<string, { type: string }>>("GET", "/session/status"),
  todo: (sessionID: string) => call<Todo[]>("GET", `/session/${sessionID}/todo`),
  messages: (sessionID: string) => call<MessageWithParts[]>("GET", `/session/${sessionID}/message`),
  prompt: (sessionID: string, text: string) =>
    call<MessageWithParts>("POST", `/session/${sessionID}/message`, { parts: [{ type: "text", text }] }),
  promptAsync: (sessionID: string, text: string) =>
    call<void>("POST", `/session/${sessionID}/prompt_async`, { parts: [{ type: "text", text }] }),
  abort: (sessionID: string) => call<void>("POST", `/session/${sessionID}/abort`),
}

export function isBusy(status: Record<string, { type: string }>, sessionID: string) {
  return status[sessionID]?.type === "busy"
}

export function totalCost(messages: MessageWithParts[]) {
  return messages.reduce((sum, message) => sum + (message.info.cost ?? 0), 0)
}

export async function waitIdle(sessionID: string, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!isBusy(await api.status(), sessionID)) return
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`session ${sessionID} stayed busy for ${timeoutMs}ms`)
}

export async function waitFor<T>(label: string, fn: () => Promise<T | undefined>, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await fn()
    if (value !== undefined) return value
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`timed out waiting for ${label} after ${timeoutMs}ms`)
}
