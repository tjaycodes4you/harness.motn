# Promote can leave live down (port race + no supervisor)

Class: deploy/restart supervision. First seen 2026-09-21: the session "died" for
~36 minutes after an idle-gated promote.

## Symptom

After a promote, the live harness never came back: the web UI was dead, the
agent process was gone, and no new turn could start. `https://harness.motionlabs.ng`
served 502s for ~36 minutes (13:09:26 → 13:45:32).

## Timeline (all times 2026-09-21, local)

| Time | Event | Evidence |
|------|-------|----------|
| 04:21:47 | watchdog's last log line — it then died silently | `%TEMP%\harness-watchdog.log` |
| 13:09:21 | idle-gated promote fires (session idle, 2/2 samples) | `%TEMP%\harness-promote.log` |
| 13:09:26 | promote kills the `:4098` listener, relaunches after a fixed 13s | server log: `server exited with code 1` |
| 13:09:39 | promote exits 1; the relaunched server never bound (ServeError race on the port) | promote log: `promote returned 1` |
| 13:11:10 | health poll gives up: `None` | promote log |
| 13:17:13 | live smoke run fails 7/7 with 502 from the CF edge | promote log |
| 13:45:32 | live comes back (manual/other-session restart) | `motn-live.exe` PID 8908 creation time |
| 13:47:44 | a new watchdog is started | watchdog log |
| 13:47:3x | promote hardened (`harness-promote.ps1`, `harness-serve-old.cmd`) | file mtimes |

## Root causes

1. **Kill-then-relaunch race.** The old `harness-promote.cmd` killed the listener
   and relaunched after a fixed 13s sleep instead of waiting for the port to be
   genuinely free. On this machine a dying server can keep the listening socket
   for a while (same class as the orphaned `:4096` socket earlier the same day),
   so the new process hit `ServeError` and exited 1.
2. **Broken fallback.** The old fallback pointed at a pre-rename binary that no
   longer exists, so nothing came up after the race was lost.
3. **No supervisor.** The watchdog had been dead for ~9.4 hours and nothing
   noticed. That is what turned a ~1 minute blip into a 36 minute outage: every
   recovery path was automatic, but the process that runs them was gone.

The promote killing the agent process is **by design** — the web UI lives inside
`motn-live.exe`, so shipping UI changes restarts it, and the session's agent
lives in the same process. The invariant that must hold: a promote may cost a
short blip, never an outage.

## Fixes

- `harness-promote.ps1` (replaces the .cmd logic): waits for the target port to be free
  (up to 60s), snapshots the running binary to `motn-live.prev.exe` first,
  verifies **HTTP health** (not just a listening socket), and reports distinct
  outcomes: `RESULT: PROMOTED` (0), `RESULT: ROLLED BACK` (5, previous binary),
  `RESULT: BLOCKED` (4, neither came up). Every exit path runs `Ensure-Watchdog`.
- `harness-watchdog.ps1`: heartbeat line every ~2 minutes (`heartbeat :4099=up
  :4097=up cloudflared=N`), a single-instance guard (matches
  `harness-watchdog\.ps1`, so launcher `cmd`/`wscript` wrappers do not count as
  duplicates), and `harness-watchdog.cmd` for detached launches.
- `packages/app/e2e-site/support/preflight.ts`: a live-tier run is BLOCKED with
  `status=unsupervised` unless a watchdog process exists and its heartbeat is
  under 10 minutes old; the check lands in `build.json` under `supervision`.
- `verify/test_harness_hosting.py` (motnKnows): asserts the watchdog process, a
  fresh heartbeat, and that live serves the pinned binary's version.
- `harness-promote-when-idle.py` only runs the suite when the promote reported
  `RESULT: PROMOTED`, so a rollback is not reported as a test failure.

## Second occurrence (2026-09-21 14:20) — zombie port + blind watchdog

Same class, different mechanics. An armed idle-gated promote produced a *bound
but unserving* port:

| Time | Event |
|------|-------|
| 14:20:43 | promote starts; the `:4098` listener is killed |
| 14:21:44 | port still busy after the 60s budget — the script logged `continuing anyway` and **launched into it** |
| 14:22:51 | HTTP health never went 200 (`new build did not come up`), fallback also failed |
| 14:23:47 | `RESULT: BLOCKED`; site effectively down |
| 14:21–14:40 | watchdog heartbeats report `:4098=up` — a TCP probe succeeds on the zombie socket while every HTTP request fails |
| 14:41–15:13 | watchdog restart loop, all `ServeError` (port bound); recovery only happened by moving live to `:4099` |

Root cause of the stuck port: **on Windows a child process can inherit the
listening socket**, so killing only the server leaves the port bound until those
children exit. This is the same mechanism behind the `:4096` → `:4098` → `:4099`
migrations. Prime suspects are long-lived server children (LSP/MCP servers, PTY
shells). `taskkill /F` with no `/T` cannot reach them.

## Fixes after occurrence 2

- **Kill the tree, not the process.** Promote and watchdog now use
  `taskkill /F /T /PID`, so inherited socket handles die with the server.
- **Never launch into a busy port.** Port budget raised 60s → 300s; if it is
  still busy the promote stops, reports `RESULT: BLOCKED port <n> busy`, and
  leaves recovery to the watchdog. The fallback path clears the port first.
- **The watchdog checks HTTP health, not just TCP.** A bound-but-unhealthy port
  (`zombie`) gets its owner killed (`/T`) and restarted; heartbeats now read
  `:4099=up|down|zombie`.
- **Port reconciled to `:4099`** across `harness-serve.cmd`,
  `harness-serve-old.cmd`, `harness-watchdog.ps1`, `harness-promote.ps1`,
  `harness-autostart.cmd`, `harness-promote-when-idle.py` (waits for idle on
  4099), the cloudflared ingress, and the KB verify test.

## Residual risk

Nothing supervises the watchdog itself — if it dies again, the state is now
visible (heartbeat + preflight + verify) but recovery is manual. The durable fix
is the already-recorded `unverified` item: move hosting to a Linux box with
systemd units for the two servers and two tunnels.

## Recurrence (same day): the orphaned socket, not the race

At ~14:23 the armed promote hit the *other* half of this class: it killed the
`:4098` listener and the port never came back, because the `LISTENING` socket
outlived its owner (netstat/`Get-NetTCPConnection` still name the dead PID; no
live child holds it). `bind` → WinError 10048, so the new server and the
fallback both died on `ServeError`, the promote correctly reported
`RESULT: BLOCKED`, and two watchdogs crash-looped every ~29s until 15:14. Live
moved to `:4099` (see `docs/bugs/in-process-sync-crashes-server.md` for the 4096
occurrence of the same mechanism). The health-gate and watchdog bounds the
damage, but the real fix is to stop kill-and-rebind on a fixed port: start the
new build on a rotating port, health-check it, repoint the tunnel ingress, then
retire the old process.

## Related

- `docs/features/live-tester.md` (the preflight that now gates on supervision)
- `docs/bugs/in-process-sync-crashes-server.md` (the sibling restart-race class)
- motnKnows `references/env/README.md` "motn harness hosting"
