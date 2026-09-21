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
  reconciled: number
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
        reconciled: reconcileEventSequence(db),
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

// The sync copies `event` rows but leaves the per-aggregate `event_sequence`
// counter possibly behind them. The server then picks a `seq` that already
// exists, the event insert fails, and prompt_async swallows it — the prompt is
// dropped. Push every counter up to its aggregate's max seq so future writes
// cannot collide.
function reconcileEventSequence(db: Database) {
  const exists = db
    .query<{ name: string }, []>(
      "SELECT name FROM main.sqlite_master WHERE type = 'table' AND name = 'event_sequence'",
    )
    .get()
  if (!exists) return 0
  return db
    .query<{ aggregate_id: string }, []>(
      `INSERT INTO main.event_sequence (aggregate_id, seq, owner_id)
       SELECT aggregate_id, MAX(seq), NULL FROM main.event GROUP BY aggregate_id
       ON CONFLICT(aggregate_id) DO UPDATE SET seq = MAX(event_sequence.seq, excluded.seq)
       RETURNING aggregate_id`,
    )
    .all().length
}
