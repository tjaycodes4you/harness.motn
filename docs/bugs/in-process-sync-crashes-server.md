# In-process DB sync ran on the HTTP event loop and killed the server

Class: blocking work in a request handler. First seen 2026-09-21 (build
`0.0.0-dev-202609210804`).

## Symptom

`POST /experimental/motn/sync-push` made the harness stop answering: the port
stayed LISTENING but connections were refused/never completed, and the log showed

```
Error: Unexpected error
ServeError
[2026-09-21  4:06:50.81] server exited with code 1
```

The watchdog restarted it, but the port was then held by a stale listener and
every restart died the same way.

## Trigger

Call the sync endpoint (either direction) while the peer database is busy.
Worst case is push: the merge writes to the plain opencode DB, which is actively
written by the running opencode, so the merge waited on the write lock
(`busy_timeout`) while blocking the JS event loop.

## Root cause

`server.ts` called `motnSyncSessions(source, target)` synchronously inside an
`Effect.try` in the route handler. The merge is CPU- and IO-heavy synchronous
SQLite work (full-table scans over `event`/`part`, plus lock waits). Bun's HTTP
server shares that thread, so a long merge stalls or kills the server.

## Fix

The route now spawns the same binary as a child process
(`Bun.spawn([process.execPath, "__motn-sync", "--push"|"--pull"])`) and returns
its JSON, so the merge never runs on the server's event loop:

- `packages/opencode/src/index.ts` — hidden `__motn-sync` branch (runs before the
  CLI is built, prints the result as JSON, exits).
- `packages/opencode/src/server/routes/instance/httpapi/server.ts` — `runMerge`
  spawns the worker and surfaces a 500 with the worker's stderr on failure.

## Consequence found in the same incident: port 4096 became unusable

The crash loop left an **orphaned LISTENING socket** on 4096 (owner PID gone;
`tasklist` had no such process, `bind` returned WinError 10048, connections were
refused). Live was moved to **:4098**:

- `harness-serve.cmd` (`--port 4098`), `harness-promote.cmd`, `harness-watchdog.ps1`
- `C:\Users\TJ\.cloudflared\config.yml` ingress → `http://localhost:4098`
- `harness-tunnel-live.cmd` comment; tunnel restarted

Public URL is unchanged (`https://harness.motionlabs.ng`).

## Evidence

- push via endpoint after the fix: 200 in 7s, `/global/health` 200 immediately
  after, no new `ServeError` lines.
- before the fix: exit 1 at 04:06:50 exactly when the endpoint was called.
- `netstat` showed `0.0.0.0:4096 LISTENING <dead pid>` while `tasklist /FI "PID eq
  <pid>"` reported no tasks and `socket.bind(4096)` failed with 10048.

## Related

- `docs/features/reverse-sync-push.md`
- `docs/bugs/todo-dock-idle-hidden.md` (same session of work)
