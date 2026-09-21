import { createHash } from "node:crypto"
import { readFileSync, statSync } from "node:fs"
import { api } from "./api"
import { baseURL, expectedVersion, tier } from "./env"
import { writeJson } from "./evidence"

// Check #0 of every livetest run: prove the target is reachable and running the
// build we think it is, before any assertion is trusted.
const build: Record<string, unknown> = {
  tier: tier(),
  target: baseURL(),
  expectedVersion: expectedVersion(),
  checkedAt: new Date().toISOString(),
}

if (process.env.LIVE_PINNED_BIN) {
  const file = process.env.LIVE_PINNED_BIN
  build.pinned = {
    path: file,
    mtime: statSync(file).mtime.toISOString(),
    sha256: createHash("sha256").update(readFileSync(file)).digest("hex"),
  }
}

try {
  const health = await api.health()
  build.health = health
  if (!health.healthy) build.status = "unhealthy"
  else if (expectedVersion() && health.version !== expectedVersion()) build.status = "version-mismatch"
  else build.status = "ok"
} catch (error) {
  build.status = "unreachable"
  build.error = String(error)
}

writeJson("build.json", build)
console.log(`preflight ${build.status}: ${build.target} (${JSON.stringify(build.health ?? build.error)})`)
process.exit(build.status === "ok" ? 0 : 4)
