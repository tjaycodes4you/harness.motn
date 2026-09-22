# Deploy contract: updates without killing the site

Status 2026-09-22. Goal: shipping a new build must not take the site down (L1)
and must not kill in-flight agent turns (L2). Allowance: ≤3 failed public
requests, ≤2s max gap, SSE reconnect <3s; PTY terminals drain up to 10 minutes
before being retired (turns are never force-killed).

## Tiers

| Tier | Public entry | Front | Backend pool | Build drop | State |
|---|---|---|---|---|---|
| live | `harness.motionlabs.ng` | `:4102` | 4103–4115 | harness dist | `deploy-state.json` |
| test | `test-harness.motionlabs.ng` | `:4097` | 4126–4135 | harness dist | `deploy-state-test.json` |
| hermetic | local only | `:4098` | 4116–4125 | — (uses staged copies) | `deploy-state-hermetic.json` |

`motn-deploy.ps1 -Tier <tier> -Action status|backend|promote|drain`. Promoting
**live** also requires `-AllowLive`; recovery actions are never gated so a broken
live backend can always self-heal.

## Topology

```
cloudflared -> front (fixed port) -> backend (rotating pool port)
```

- **`motn-front.js`** — stable entrypoint. Proxies HTTP, streams SSE without
  buffering, bridges WebSocket upgrades (PTY), tracks open streams, and exposes a
  loopback control plane:
  - `GET  /__front/status` → `{ listen, upstream, build, openStreams, uptimeSeconds }`
  - `POST /__front/upstream` → `{ "port": 4104, "build": "0.0.0-dev-..." }`
  Its active upstream lives in `front-<port>.json`, so a front restart resumes
  the right backend.
- **`motn-deploy.ps1`** (entry `motn-deploy.cmd`) — `status | backend | promote | drain`:
  - `backend`: if the backend is unhealthy, start one on the first free pool port,
    gate on `/global/health`, swap the front, update `deploy-state.json`.
  - `promote`: copy the built binary to the pinned path with a **sha256 verify**,
    start it on a free pool port, gate health + identity (version vs pinned
    binary), swap the front, keep the old backend as `previousPort`.
  - `drain`: wait until no assistant message is incomplete (turn idle), then
    retire `previousPort` with `taskkill /F /T`.
  - `status`: prints `{frontPort, frontAlive, backendPort, backendVersion,
    previousPort, build, turn}` and exits 4 when either layer is unhealthy.
- **`harness-serve.cmd [port]`** / `harness-serve-old.cmd [port]` — backend
  (pinned / previous build) on a pool port.
- **Watchdog v4** — supervises all three layers: restarts the front in place
  (killing a wedged holder's tree first), calls `motn-deploy -Action backend`
  when the backend is unhealthy, restarts the test harness and tunnels, and
  heartbeats `front:<p>=up|down backend:<p>=up|down test:4097=... cloudflared=N`.

## Why the fixed front

The recurring failure of 2026-09-21/22 was an **orphaned listening socket**: the
server died (or was killed) and the port stayed bound with a dead owner, so no
restart could bind. Live moved `:4096 → :4098 → :4099 → :4103` because of it
(`docs/bugs/promote-race-no-supervisor.md`). With the front owning the public
path, a stuck backend port is simply **retired, never reused**: `motn-deploy
-Action backend` starts the next backend on a fresh pool port and swaps.

## Verified

- HTTP, SSE (byte-identical to a direct connection) and WebSocket/PTY
  pass-through through the front.
- Runtime upstream swap in both directions, with the state file persisted.
- Backend self-heal: unhealthy backend → new backend on a fresh port → front
  swapped (watchdog path).
- Live `live-test.cmd smoke` → `RESULT: PASS` (7/7) on `0.0.0-dev-202609211818`
  through the front.

## Not yet (tracked)

- `promote` does not itself wait for the drain; the idle watcher calls
  `-Action drain` after the suite. Wire drain into promote for a one-shot deploy.
- Identity gate is a version compare; add a build nonce so a rogue process on a
  pool port cannot fake health.
- Adversarial catalogue (fault injection) has not run yet — that is M1/M2.
- Hermetic tier instance (own backend + front, own DB snapshot) for fault
  injection runs; adversarial end-to-end runs use `test.harness`.
- v2 `SessionStatus` is still empty for v2 turns; drain uses the DB message
  marker instead.
- PTY drain cap is `drain`'s 600s constant.
