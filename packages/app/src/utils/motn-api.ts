import { ServerConnection } from "@/context/server"
import { authTokenFromCredentials } from "@/utils/server"

// harness.motn-specific server endpoints are raw routes (outside the generated
// HttpApi), so they are called with plain fetch instead of the SDK client.
export async function motnPost<T>(server: ServerConnection.HttpBase, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" }
  if (server.password) {
    headers.Authorization = `Basic ${authTokenFromCredentials({ username: server.username, password: server.password })}`
  }
  const response = await fetch(new URL(path, server.url), {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) throw new Error((await response.text().catch(() => "")) || response.statusText)
  return (await response.json()) as T
}
