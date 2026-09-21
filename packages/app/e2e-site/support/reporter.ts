import { writeFileSync } from "node:fs"
import path from "node:path"
import type { FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter"
import { evidenceDir, type Tier } from "./env"

type Row = {
  title: string
  file: string
  status: string
  duration: number
  retry: number
  error?: string
  artifacts: string[]
}

type Report = {
  runId?: string
  tier?: Tier
  target?: string
  verdict: "PASS" | "FAIL" | "FLAKE" | "SKIP" | "BLOCKED"
  playwrightStatus: string
  startedAt: number
  finishedAt: number
  totals: { tests: number; failed: number; flaky: number; skipped: number }
  rows: Row[]
}

function verdictFor(rows: Row[], status: FullResult["status"]): Report["verdict"] {
  if (status === "interrupted") return "BLOCKED"
  if (rows.some((row) => row.status === "failed" || row.status === "timedOut")) return "FAIL"
  if (rows.some((row) => row.retry > 0 && row.status === "passed")) return "FLAKE"
  if (rows.length > 0 && rows.every((row) => row.status === "skipped")) return "SKIP"
  return "PASS"
}

function renderMarkdown(report: Report) {
  const lines = [
    `# livetest — ${report.verdict}`,
    "",
    `- run: \`${report.runId ?? "manual"}\``,
    `- tier: ${report.tier ?? "?"} → ${report.target ?? "?"}`,
    `- playwright: ${report.playwrightStatus}`,
    `- tests: ${report.totals.tests} (failed ${report.totals.failed}, flaky ${report.totals.flaky}, skipped ${report.totals.skipped})`,
    `- duration: ${((report.finishedAt - report.startedAt) / 1000).toFixed(1)}s`,
    "",
    "| status | test | duration |",
    "| --- | --- | --- |",
  ]
  for (const row of report.rows) {
    lines.push(`| ${row.retry > 0 ? `${row.status} (retry ${row.retry})` : row.status} | ${row.title} | ${(row.duration / 1000).toFixed(1)}s |`)
  }
  const failures = report.rows.filter((row) => row.error)
  if (failures.length > 0) {
    lines.push("", "## Failures", "")
    for (const row of failures) {
      lines.push(`### ${row.title}`, "", "```", row.error ?? "", "```", "")
    }
  }
  return lines.join("\n")
}

export default class LivetestReporter implements Reporter {
  private rows: Row[] = []
  private startedAt = Date.now()

  onTestEnd(test: TestCase, result: TestResult) {
    this.rows.push({
      title: test.title,
      file: path.relative(process.cwd(), test.location.file),
      status: result.status,
      duration: result.duration,
      retry: result.retry,
      error: result.error?.message?.split("\n").slice(0, 8).join("\n"),
      artifacts: result.attachments.flatMap((attachment) => (attachment.path ? [attachment.path] : [])),
    })
  }

  onEnd(result: FullResult) {
    const report: Report = {
      runId: process.env.LIVE_RUN_ID,
      tier: process.env.LIVE_TIER as Tier | undefined,
      target: process.env.SITE_BASE_URL,
      verdict: verdictFor(this.rows, result.status),
      playwrightStatus: result.status,
      startedAt: this.startedAt,
      finishedAt: Date.now(),
      totals: {
        tests: this.rows.length,
        failed: this.rows.filter((row) => row.status === "failed" || row.status === "timedOut").length,
        flaky: this.rows.filter((row) => row.retry > 0 && row.status === "passed").length,
        skipped: this.rows.filter((row) => row.status === "skipped").length,
      },
      rows: this.rows,
    }
    const dir = evidenceDir()
    writeFileSync(path.join(dir, "report.json"), JSON.stringify(report, null, 2))
    writeFileSync(path.join(dir, "report.md"), renderMarkdown(report))
  }
}
