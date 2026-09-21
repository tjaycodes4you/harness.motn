import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync, statSync } from "node:fs"
import { api } from "./api"
import { baseURL, expectedVersion, tier } from "./env"
import { writeJson } from "./evidence"

// Host supervision (live tier only): a dead watchdog is invisible to the app,
// and on 2026-09-21 one silently missing for hours turned a failed promote
// into ~35 minutes of downtime. Recovery is only automatic while it runs.
function checkSupervision() {
  try {
    const command = [
      "$log = Join-Path $env:TEMP 'harness-watchdog.log'",
      "$count = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'harness-watchdog\\.ps1' }).Count",
      "$beat = Select-String -Path $log -Pattern 'heartbeat' | Select-Object -Last 1",
      "$line = if ($beat) { $beat.Line } else { '' }",
      "Write-Output \"watchdog=$count\"",
      "Write-Output \"heartbeat=$line\"",
    ].join("; ")
    const output = execFileSync("powershell", ["-NoProfile", "-Command", command], { encoding: "utf8", timeout: 60_000 })
    const watchdog = Number(/watchdog=(\d+)/.exec(output)?.[1] ?? 0)
    const heartbeat = /heartbeat=\[([^\]]+)\]/.exec(output)?.[1]
    const ageSeconds = heartbeat ? (Date.now() - new Date(heartbeat).getTime()) / 1000 : undefined
    return { watchdog, heartbeat, ageSeconds, ok: watchdog > 0 && ageSeconds !== undefined && ageSeconds < 600 }
  } catch (error) {
    return { watchdog: 0, ok: false, error: String(error) }
  }
}

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

if (tier() === "live") {
  const supervision = checkSupervision()
  build.supervision = supervision
  if (!supervision.ok && build.status === "ok") build.status = "unsupervised"
}

writeJson("build.json", build)
console.log(`preflight ${build.status}: ${build.target} (${JSON.stringify(build.health ?? build.error)})`)
process.exit(build.status === "ok" ? 0 : 4)
