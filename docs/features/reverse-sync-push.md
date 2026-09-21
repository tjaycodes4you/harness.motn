# Reverse sync: push harness sessions into plain opencode

Shipped 2026-09-21 (build `0.0.0-dev-202609210812`). Pull sync (plain opencode →
harness) already existed; this adds the opposite direction so sessions created in
the harness show up in the normal opencode install.

## Usage

- Settings → Data → **Push to opencode** (`data-action="settings-motn-sync-push"`).
  The existing button is now **Sync from opencode** (`settings-motn-sync-pull`),
  same endpoint as before.
- API: `POST /experimental/motn/sync-push` (Basic auth). `POST /experimental/motn/sync`
  is unchanged (pull).
- Either direction can be run directly from the binary:
  `motn-live.exe __motn-sync --push` / `__motn-sync --pull` (prints the merge
  result as JSON; used by the endpoint).

Both directions are the same additive `INSERT OR IGNORE` merge over every shared
table, followed by `event_sequence` reconciliation on the destination. The peer
path is `<data>/harness.motn/<db>` ↔ `<data>/opencode/opencode.db`
(`peerDatabase` in `packages/opencode/src/motn/sync.ts`).

## Why it runs out-of-process

The merge is heavy synchronous SQLite work (full-table scans plus lock waits on
the peer database, which is actively written by the running opencode). Running it
inside the HTTP handler blocked the server's event loop and killed the process
(`ServeError`, exit 1) — see `docs/bugs/in-process-sync-crashes-server.md`.

The endpoint now spawns the same binary as a child (`process.execPath __motn-sync
--push`), waits for it, and returns its JSON. The server stays responsive no
matter how long the merge takes or how long it waits on the peer's lock.

## Evidence

- direct worker: pull inserted 131 rows; push inserted 36,953 rows — 35 sessions,
  1,774 messages, 7,640 parts, 27,446 events (first run after the feature landed)
- endpoint: `POST /experimental/motn/sync-push` → 200 in 7s, `inserted: 0`
  (idempotent), `reconciled: 233`; `/global/health` → 200 immediately after
- plain opencode DB now reports 233 sessions, including harness-created ones
  (`pong`, `livetest:*`)
- `live-test.cmd smoke` vs live → `RESULT: PASS` (6/6)

## Notes

- The schemas of the two databases are currently identical (20 shared tables, no
  column differences), which is what makes the symmetric merge safe. Re-check
  before assuming it: a version skew turns `INSERT ... SELECT *` into a failure.
- Push writes into a database owned by a running opencode process. It is additive
  and reconciles `event_sequence`, but the peer's in-memory caches may need a
  refresh before new sessions appear.
