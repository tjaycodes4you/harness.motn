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
| staging | `staging-harness.motionlabs.ng` | `:4136` | 4137–4146 | harness dist | `deploy-state-staging.json` |
| hermetic | local only | `:4098` | 4116–4125 | — (uses staged copies) | `deploy-state-hermetic.json` |

`motn-deploy.ps1 -Tier <tier> -Action status|backend|promote|drain`. Promoting
**live** also requires `-AllowLive`; recovery actions are never gated so a broken
live backend can always self-heal. Staging and test promote ungated — they are
for pre-live verification, not public traffic.

Staging is a **pre-live replica**: its DB is a one-time `VACUUM INTO` clone of
the live DB, it runs the same harness dist and config dir, and it is the tier
where the adversarial catalogue must pass before a build goes to live.

A fresh tier needs `front-<tier>.json` seeded with a placeholder upstream before
its first front start (the front exits if the state file has no upstream);
`promote` then swaps it to the real backend.

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
  It also carries the **public KB console route**: when
  `C:\Users\TJ\bin\front-knows.json` is `enabled` and the front's listen port is
  in its `ports` list (only live `:4102`), `/knows/*` is gated by its own
  constant-time Basic check (realm `motn.knows`) and proxied to the fixed KB API
  (`:7781`, `motn-knows-api.cmd`) instead of the rotating backend. Fail-closed:
  config missing/disabled or port not listed → `/knows` goes to the normal
  upstream (404). Config is read once at front boot; restart the front to change
  it. See `docs/features/public-knows-console.md`.
- **`motn-deploy.ps1`** (entry `motn-deploy.cmd`) — `status | backend | promote | drain`:
  - `backend`: if the backend is unhealthy, start one on the first free pool port,
    gate on `/global/health`, swap the front, update `deploy-state.json`.
  - `promote`: copy the built binary to the pinned path with a **sha256 verify**,
    start it on a free pool port, gate health + identity (`/global/health` returns
    `build` = sha256 of `MOTN_BUILD_ID`, compared with the staged hash), swap the
    front, keep the old backend as `previousPort`. Per-tier lock: a concurrent
    promote returns `RESULT: BUSY`. Warmup requests through the front hide the
    cold-start gap after the swap.
  - `drain`: wait until no assistant message is incomplete (turn idle), then
    retire `previousPort` with `taskkill /F /T`.
  - `status`: prints `{frontPort, frontAlive, backendPort, backendVersion,
    backendBuild, previousPort, build, turn}` and exits 4 when either layer is
    unhealthy.
- **`harness-serve.cmd [port]`** / `harness-serve-old.cmd [port]` — backend
  (pinned / previous build) on a pool port.
- **Watchdog v6** — supervises every tier: restarts a front in place (killing a
  wedged holder's tree first), calls `motn-deploy -Action backend` when a backend
  is unhealthy, and checks each cloudflared tunnel by name. Front health is
  **through the proxy** (an authed request), not just `/__front/status`: on
  2026-09-22 the live front answered its control endpoint while its proxied path
  hung, which surfaced only as public CF 502s.

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
  swapped (watchdog path), with bind-based free-port probes and retry across
  **distinct** ports.
- **Adversarial catalogue** (`adversary.ps1`): `clean` (0 failed, 723ms gap),
  `port-occupied`, `candidate-crash` and `rollback-missing` (both `BLOCKED` with
  the site up), `lock-race` (one `PROMOTED` + one `BUSY`), `backend-killed` and
  `front-killed` (recovered) — first green 7/7 on **test**, then on **staging**.
- Measured deploy cost (motn-probe, public URL): test `0 failed / 723ms`, live
  `0 failed / 3146ms`, staging `0 failed / 674ms`; hermetic warm gap 517ms.
- Live `live-test.cmd smoke` → `RESULT: PASS` (7/7), staging smoke 7/7.
- Review-panel close button (regression-tested in Playwright on staging, public
  + localhost).

## Not yet (tracked)

- `promote` does not itself drain; call `-Action drain` (or the idle watcher)
  after the promote. Turns are never force-killed.
- Live's first post-swap gap (3146ms) is above the 2.5s target on the larger
  live DB; stronger warmup or an async drain is wanted.
- The front-wedge root cause (control endpoint alive, proxied path hung,
  2026-09-22) is unknown; detection/self-heal (proxied health checks, upstream
  reconcile) is in place.
- Migration-overlap detection exists (`migrations=+N`), but a stop-then-migrate
  cutover mode is not implemented.
- v2 `SessionStatus` is still empty for v2 turns; drain uses the DB message
  marker instead.
- PTY drain cap is `drain`'s 600s constant.
