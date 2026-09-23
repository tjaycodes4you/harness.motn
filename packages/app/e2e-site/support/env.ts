import { mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

export type Tier = "hermetic" | "test" | "staging" | "live"

const tierURLs: Record<Tier, string> = {
  hermetic: "http://127.0.0.1:4098",
  test: "https://test-harness.motionlabs.ng",
  staging: "https://staging-harness.motionlabs.ng",
  live: "https://harness.motionlabs.ng",
}

export function tier(): Tier {
  const value = process.env.LIVE_TIER ?? "staging"
  if (value === "hermetic" || value === "test" || value === "staging" || value === "live") return value
  throw new Error(`unknown LIVE_TIER: ${value}`)
}

export function baseURL() {
  return (process.env.SITE_BASE_URL ?? tierURLs[tier()]).replace(/\/$/, "")
}

export function authHeaders(): Record<string, string> {
  if (!process.env.SITE_PASSWORD) return {}
  const user = process.env.SITE_USER ?? "opencode"
  const token = Buffer.from(`${user}:${process.env.SITE_PASSWORD}`).toString("base64")
  return { authorization: `Basic ${token}` }
}

// Sessions created by scenarios land in this directory; unset means the target's default.
export function directory() {
  return process.env.LIVE_DIRECTORY
}

export function expectedVersion() {
  return process.env.LIVE_EXPECT_VERSION
}

export function budgetUSD() {
  const value = Number(process.env.LIVE_BUDGET_USD ?? "0.05")
  return Number.isFinite(value) && value > 0 ? value : 0
}

// Model-calling scenarios are refused on live unless explicitly opted in.
export function modelAllowed() {
  return tier() !== "live" || process.env.LIVE_ALLOW_LIVE_MODEL === "1"
}

export function keepSessions() {
  return process.env.LIVE_KEEP === "1"
}

export function evidenceDir() {
  const dir =
    process.env.LIVE_EVIDENCE_DIR ?? path.join(tmpdir(), "harness.motn", "livetest", `manual-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

export function fixtureTitle(scenario: string) {
  return `livetest:${scenario}:${new Date().toISOString()}`
}

export function fixtureSession(name: string) {
  const key = `LIVE_SESSION_${name.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`
  return process.env[key]
}

export function model() {
  const value = process.env.LIVE_MODEL
  if (!value) return undefined
  const [providerID, ...rest] = value.split("/")
  if (!providerID || rest.length === 0) throw new Error(`LIVE_MODEL must be provider/model, got: ${value}`)
  return { providerID, modelID: rest.join("/") }
}
