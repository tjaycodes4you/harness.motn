import { Database } from "bun:sqlite"
import { dirname, join } from "path"

// harness.motn is served with its own database while the plain opencode install
// keeps writing its own. Merge the two additively: never update or delete, only
// INSERT OR IGNORE rows the harness does not have yet. Mirrors bin/harness-sync.ts
// so a Settings button and the CLI script stay in lockstep.
const SKIP_TABLES = new Set(["migration"])

export type SyncCount = { table: string; inserted: number }
export type SyncResult = {
  source: string
  target: string
  counts: SyncCount[]
  inserted: number
  syncedAt: number
}

export function defaultSource(target: string) {
  if (process.env.MOTN_SYNC_SOURCE) return process.env.MOTN_SYNC_SOURCE
  // <data>/harness.motn/<db> -> <data>/opencode/opencode.db
  return join(dirname(dirname(target)), "opencode", "opencode.db")
}

export function syncSessions(source: string, target: string): SyncResult {
  const src = new Database(source, { readonly: true })
  const db = new Database(target)
  try {
    db.exec("PRAGMA foreign_keys = OFF")
    db.exec("PRAGMA busy_timeout = 60000")
    db.exec(`ATTACH DATABASE '${source.replace(/'/g, "''")}' AS src`)
    try {
      const sourceTables = new Set(
        src
          .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table'")
          .all()
          .map((row) => row.name),
      )
      const tables = db
        .query<{ name: string }, []>(
          "SELECT name FROM main.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
        )
        .all()
      const counts: SyncCount[] = []
      for (const table of tables) {
        if (SKIP_TABLES.has(table.name) || !sourceTables.has(table.name)) continue
        const before = count(db, "main", table.name)
        if (before === undefined) continue
        db.exec(`INSERT OR IGNORE INTO main."${table.name}" SELECT * FROM src."${table.name}"`)
        const after = count(db, "main", table.name)
        if (after === undefined) continue
        if (after > before) counts.push({ table: table.name, inserted: after - before })
      }
      return {
        source,
        target,
        counts,
        inserted: counts.reduce((total, item) => total + item.inserted, 0),
        syncedAt: Date.now(),
      }
    } finally {
      db.exec("DETACH DATABASE src")
    }
  } finally {
    db.close()
    src.close()
  }
}

function count(db: Database, schema: string, table: string) {
  try {
    return db.query<{ c: number }, []>(`SELECT count(*) AS c FROM ${schema}."${table}"`).get()?.c
  } catch {
    return undefined
  }
}
