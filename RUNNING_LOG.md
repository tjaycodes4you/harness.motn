# RUNNING_LOG — harness.motn (opencode fork)

Findings `F#`, mistakes `M#`, and first-seen signals for this repo. Verified
project knowledge lives in motnKnows; this file tracks what we changed *here*.

## 2026-09-19 — rebrand + fork operations

- **F1 — GitHub Actions disabled on this fork.** This repo inherited all of
  upstream `anomalyco/opencode`'s workflows (26 files under
  `.github/workflows/`, many on `schedule`). On the fork they run pointlessly and
  alert: the scheduled `close-prs` job tried to comment/close PRs on
  `anomalyco/opencode` with this repo's `GITHUB_TOKEN` and failed
  `403 Resource not accessible by integration` (run `35477529005`), firing a
  GitHub alert.
  - Disabled Actions on both fork repos (reversible):
    `gh api -X PUT repos/tjaycodes4you/harness.motn/actions/permissions -F enabled=false`
    and the same for `tjaycodes4you/test.harness.motn`.
  - To re-enable: Settings → Actions, or the same API with `-F enabled=true`
    (prune `.github/workflows` to only what you want first).
  - Local verification is **not** CI: use the deployed-site Playwright suite
    `packages/app/e2e-site/` via `bun run --cwd packages/app test:site` or
    `C:\Users\TJ\bin\site-test.cmd`.
- **F2 — identity rebrand.** `app` data/config dir → `harness.motn`, CLI `motn`,
  `MOTN_` env prefix via `packages/core/src/flag/env-compat.ts` (maps `MOTN_*`
  onto `OPENCODE_*`), `motn` wordmark, web title/manifest. `@opencode-ai/*` and
  `OPENCODE_*` literals kept so upstream merges stay clean.
- **F3 — silent empty assistant turns surfaced.** `TimelineRow.NoResponse`
  renders "No response was generated." + Retry when an assistant turn produced no
  parts and 0 tokens (previously rendered as nothing).
- **F4 — project `.opencode` tools failed to install (empty turns).** Any project
  whose `.opencode/tool|plugin/*.ts` imports `@opencode-ai/plugin` needs that dep
  installed into `.opencode`. `packages/opencode/src/config/config.ts` (and
  `tui.ts`) pinned it to `InstallationVersion` unless the channel was `local`.
  Our builds are channel `dev` with an **unpublished** `0.0.0-dev-<ts>` version,
  so `npm install` failed with
  `NpmInstallFailedError: @opencode-ai/plugin@0.0.0-dev-…`, the import didn't
  resolve, `prompt_async` died with `Cannot find module '@opencode-ai/plugin'`,
  and the turn rendered as an empty (now "No response") assistant message —
  observed in `C:\Users\TJ\ZCodeProject\opencode` (`ses_f4571d8a…`).
  - Fix: pin only on real release channels —
    `["latest","beta","prod"].includes(InstallationChannel) ? InstallationVersion : undefined`
    — so preview/dev builds install the published `@opencode-ai/plugin` (now
    `1.18.31`). Mirrors the `database.path()` channel rule.
- **F5 — on-demand sync from plain opencode.** The plain (npm) opencode keeps
  writing `~/.local/share/opencode/opencode.db`; the harness serves
  `~/.local/share/harness.motn/motn.db`. One-way **additive** merge
  (`C:\Users\TJ\bin\harness-sync.cmd` → `harness-sync.ts`, `bun:sqlite`):
  `PRAGMA foreign_keys=OFF` + `busy_timeout=60000`, `ATTACH` the source, and
  `INSERT OR IGNORE INTO main.<t> SELECT * FROM src.<t>` for every table except
  `migration`. Idempotent; safe while the harness serves the destination (WAL).
  Schemas are identical (38 migrations, same tables) and project ids match.
  Verified: pulled **3 sessions** (+591 messages, +2549 parts, +10 693 events);
  `TM ACO` renders on live. **Caveat:** additive only — source renames/edits/
  deletes do not propagate, and re-running only adds rows that don't exist yet.
- **F6 — harness `:4096` found down.** During this work the live server was not
  listening and its log ended in `^C` (interrupted — likely a stray Ctrl+C/console
  close during the promote churn). Restarted via `harness-autostart.cmd`; added
  the `ping`-based waits (F1 scripts) to avoid `timeout` failing under redirected
  input. Watch for recurrence. (Recurred once more during this session; restarted
  via `harness-serve.cmd`.)
- **F7 — home searches every session, not just opened projects.** The home
  session list was scoped to directories of projects the browser had opened
  (`buildHomeSessionRecords` filtered on `projectDirectories`), so a fresh browser
  showed "Nothing here yet" and the search box returned "No sessions found" until
  each project was added by hand. Two changes:
  1. `home-sessions-controller.tsx` now shows recent sessions from **all**
     directories when no project is selected (still scoped when one is), with a
     `{ worktree, expanded:false }` fallback project so unknown directories render
     a folder-name label.
  2. `home-session-search-controller.ts` now also queries the server globally via
     `ctx.sdk.client.v2.session.list({ search, limit:50, order:"desc" })`
     (`GET /api/session?search=`), debounced 120ms + abortable, merged after the
     local index. This is the same endpoint the hidden command palette already
     used (`createServerSessionEntries`).
  Verified live: 64 rows on a fresh home, `TM ACO` → 1, `walmart` → 6, 0 console
  errors; site suite extended with a home-search case, 5/5 on test + live.
- **F8 — global search opens under the selected project; new project; sync button.**
  Three home/settings additions:
  1. `home-sessions-controller.open` now keeps the currently selected project:
     when `home.project.selected()` exists it opens the tab under that directory
     instead of switching to the directory that owns the session. So a global
     search hit can be opened in place without losing your project context.
  2. **New project** button on the home (`data-action="home-new-project"`) opens
     `dialog-new-project.tsx`; creating calls a new server route
     `POST /experimental/motn/mkdir` (`{ path }`) and adds the directory as a
     project. The web uses the V1 directory dialog, which has no footer to host a
     "new folder" control, hence a dedicated dialog.
  3. **Settings → General → Data → Sync now** calls
     `POST /experimental/motn/sync`, which runs the same additive merge as
     `bin/harness-sync.ts` using a second `bun:sqlite` connection (foreign_keys
     OFF, ATTACH, INSERT OR IGNORE, every table except `migration`). It returns
     per-table insert counts; the button toasts "already up to date" or
     "{{count}} new rows added".
  Both routes are raw `HttpRouter.use` routes added to the merge in
  `httpapi/server.ts`, so they are outside the declared HttpApi and need no SDK
  regeneration; the app calls them with plain `fetch` via `utils/motn-api.ts`.
  Verified: fresh-target sync inserted 198 sessions / 35 523 messages /
  139 281 parts / 607 089 events in ~43s; test + live site suites 6/6.
- **F9 — sync progress animation.** The Settings sync button is replaced while
  running by an animated spinner + live elapsed seconds
  (`role="status"`, "Syncing 12s"), then toasts the inserted-row count. A sync
  runs 5-45s, so a static disabled button looked frozen.
- **F10 — recurring live `:4096` death is the real "frontend stuck" cause.** The
  server log ends in `^C` (console interrupt) each time; the pinned binary is
  launched through a minimized `cmd` console, so a console close / process-tree
  kill takes the server down, CF then returns 502, and an open session page keeps
  showing its last rendered state (looks frozen, e.g. TM ACO stuck on "Thinking"
  + todos). After restart the same session renders through to its Compaction
  entry and shows no stop button. Needs fully detached hosting (Windows Scheduled
  Task) so shell teardown cannot signal it.
- **F11 — servers now launched detached (WMI); dedicated box still wanted.**
  `schtasks` is unavailable to this account (Access denied — no elevation), so
  instead of a Scheduled Task the servers are spawned via
  `C:\Users\TJ\bin\harness-detach.ps1` (`Win32_Process.Create`), which makes them
  children of `WmiPrvSE.exe` rather than of the calling shell:
  `motn-live.exe` pid 30896 parent `cmd` parent `WmiPrvSE.exe`. `harness-autostart.cmd`
  now detaches every server + tunnel through it, the tunnels got their own
  wrappers (`harness-tunnel-live.cmd`, `harness-tunnel-test.cmd`), and
  `Startup\motn-harness-autostart.vbs` runs autostart hidden at logon. This should
  end the `^C` deaths behind F10.
  **Still wanted: a dedicated server box.** This harness is a personal Windows
  machine; process supervision, logon persistence and the CF tunnels should move
  to a small always-on Linux box (systemd units) instead of WMI-detached cmd
  windows. Tracked in `ideas_in_motn` RUNNING_LOG (Pending).
- **F12 — the server also dies on its own, so WMI detach (F11) is not enough.**
  After F11 the live process disappeared with NO shell involvement (no
  `motn-live.exe`, log tail ends `^C`). So the cause is the process itself
  crashing/exiting, not a console signal. The log shows a recurring
  `MaxListenersExceededWarning: Possible EventTarget memory leak ... 11 listeners`
  from `~effect/Effect/evaluate` before deaths — suspicious but not yet proven
  fatal. Mitigations now in place:
  1. `harness-serve.cmd` / `harness-test.cmd` append `server exited with code
     %ERRORLEVEL%` so the next death records its exit code.
  2. `harness-watchdog.ps1` (+ `.cmd`) polls 127.0.0.1:4096/4097 every 15s and
     restarts any downed server (and cloudflared) via `harness-detach.ps1`;
     started detached and from `Startup\motn-harness-autostart.vbs`. Live recovers
     within ~15s instead of staying 502.
  Still to do: capture the crash exit code/stack and fix it, then move to the
  dedicated box (F11).
- **F13 — launcher must be hidden, not just detached.** `Win32_Process.Create`
  of `cmd /c <script>` still produced a *visible* console window; closing it
  killed the server and the watchdog (ports went down together). `harness-detach.ps1`
  now creates `wscript.exe //nologo harness-hidden.vbs <script>`, and the VBS runs
  `cmd /c` with WScript window style 0, so the chain is
  `WmiPrvSE -> wscript -> cmd -> motn-live.exe` with no window. Restart helper
  `harness-restart.ps1` re-launches all three (live, test, watchdog) hidden.
  Verified: live + test both 200, 64 home rows, no visible consoles.
- **F14 — synced sessions silently swallowed prompts (the "stuck Thinking").**
  Root cause: `POST /session/:id/prompt_async` accepts (204) but the prompt's
  event write fails —
  `insert into "event" (id, aggregate_id, seq, type, data) ... seq=4220` — because
  the per-aggregate `event_sequence` counter lagged the imported `event` rows
  (TM ACO: counter `4219`, actual max seq `11082`). The seq reuses an existing row,
  the unique constraint fires, the whole prompt transaction dies, and
  `promptAsync`'s `Effect.catchCause` logs + publishes `session.error` and returns
  NoContent — so the UI shows a turn that was never persisted. Native sessions were
  unaffected (counter consistent); only DB-synced sessions broke. Reproduced:
  `noReply: true` wrote a message for a native session but not for TM ACO.
  Fix: reconcile `event_sequence` up to `MAX(event.seq)` per aggregate, in
  `packages/opencode/src/motn/sync.ts` (`reconcileEventSequence`) and
  `bin/harness-sync.ts`, so the next write cannot collide.
  Evidence: manual reconcile `4219 -> 11082` made `noReply` persist (730 -> 731);
  sync endpoint then reported `reconciled: 224`; a small imported session answered
  in 5s. Note: the original prompt was lost, so a re-send is required.

## 2026-09-20 — F15: post-F14 verification — synced ACO resumed, reconcile clean

- Live `:4096` + test `:4097` both `{"healthy":true,"version":"0.0.0-dev-202609210131"}`;
  both public hosts (harness/test-harness.motionlabs.ng) answer and 401 without
  creds (auth gate OK); watchdog running (pid 8536). Running live binary built
  21:31:59, i.e. contains the F14 fix (commit `41aa681abc`, 21:36:14).
- `motn.db` reconcile state: **0** aggregates with `event_sequence.seq < MAX(event.seq)`
  (`TM ACO`: counter == max == 11741, growing live under this session's own writes).
  The F14 bug case is resumable: `ses_f43912656ffeRjHZ2d8jmiwsVg` messages 730 -> 753
  after the fix, prompt + turns persisting.
- Source (plain `opencode.db`) high-water rowids are behind the harness on every
  table (`session` 198 vs 224, `event` 609 686 vs 616 731) — no pending rows, a
  full sync right now is a no-op.
- Site suite (Playwright) vs live: **6/6** — home + console-clean, global session
  search, new-project/settings sync affordances, Thinking trace, No-response+Retry,
  auth gate.

## 2026-09-21 — F16: session menu/meta overhaul (build `0.0.0-dev-202609210455`)

- **Settings moved into the session ⋯ menu** (`message-timeline.tsx`, v2 `MenuV2`
  and legacy `DropdownMenu`) via `command.trigger("settings.open")`. No new header
  button; it opens the normal overlay dialog.
- **Review toggle removed** from the session header (v2 + legacy + state fields)
  and the `review.toggle` command deleted. It was bound to `mod+shift+r` =
  **Ctrl+Shift+R**, which the command layer `preventDefault`s — i.e. it was
  stealing hard refresh whenever a session was open. Hard refresh works again.
- **Cost + timestamps.** Step meta is now `Build · DeepSeek · $0.0017 · 21s` with
  the duration tooltipped to `HH:MM:SS → HH:MM:SS`; a per-turn footer renders in
  the timeline `TurnGap` (`$0.0648 · 22s`); reasoning ("Thinking") triggers show
  step cost + reasoning duration (`$0.0043 · 1s`). `message-part.tsx` meta became
  a rendered item list with a `MetaItem` type + `durationLabel` helper.
- **Shift+Tab cycles build/plan.** `agent.cycle` is now `shift+tab,mod+.` with its
  `disabled: !local.agent.visible()` gate removed. Why it was inert:
  `context/local.tsx` hard-coded `current()` to `"build"` while the selector was
  hidden, so cycling never reached the prompt. The selector now shows whenever
  more than one primary agent exists. Verified by capturing the outgoing
  `prompt_async` body: `build -> plan -> build`.
- **Per-turn timestamp for the model.** `HH:MM` (from `time.created`) is
  prepended to each user turn in both request paths — core v2
  `session/runner/to-llm-message.ts` and opencode v1 `session/message-v2.ts`
  (`turnStamp`). ~2-4 tokens/turn, prompt-cached; the UI user stamp is unchanged.
  Verified the model echoes it ("The first line of the message is 00:53").
- Also folded in: another session's uncommitted `terminal.toggle` rebind (`mod+/`)
  — its `terminal.focused()` call does not exist and was removed so typecheck
  stays green.
- `harness-promote.cmd` now retries the binary copy until Windows releases the
  exe lock (the fixed sleep silently kept the old build). Verified: pinned == dist
  `00:56:43`, test + live site suites 6/6.

## 2026-09-21 — F17: `livetest`, the deployed-build tester (P0)

- New runner: `C:\Users\TJ\bin\live-test.cmd` (+ `live-test.ps1`, creds in
  `live-creds.json`). Modes `smoke|scenario|all`, tiers `hermetic|staging|live`,
  exit codes `0 PASS / 1 FAIL / 2 FLAKE / 3 SKIP / 4 BLOCKED` (SKIP != pass).
- `packages/app/e2e-site/` gained `support/{env,api,events,app,composer,evidence,preflight,reporter}.ts`;
  the six deployed checks are retagged `@smoke` and unchanged in behaviour.
- Every run writes an evidence bundle to `%TEMP%\harness.motn\livetest\<stamp>-<tier>-<mode>\`
  (`build.json`, `report.json`, `report.md`, logs, SSE/API journals).
- `build.json` is check #0: target `/global/health` version vs the pinned
  `motn-live.exe --version`. A mismatch/unreachable/unhealthy target exits
  `BLOCKED` (4) before any assertion — closes the "promote silently kept the old
  build" class.
- Verified: `live-test smoke` vs live → `RESULT: PASS`, 6/6, 28.9s, pinned sha
  `e0d99c95…`; version-mismatch probe → exit 4; hermetic (down) → exit 4
  `BLOCKED`. `bun run typecheck:site` (new) clean.

## 2026-09-21 — F18: first `@scenario` runs; todo-dock pilot finding

- `@scenario` coverage on staging (build `0.0.0-dev-202609210455`):
  - `turn-lifecycle` (10.9s): UI submit → prompt admitted (server ground truth)
    → assistant turn completes → rendered text asserted → cost cap asserted.
  - `todo-dock` (15.3s, $0.00027): model called `todowrite` (2 todos), dock
    rendered 173/612 sampled frames with states `pending, in_progress`, then
    **no dock once idle** while `alpha` was still `in_progress`.
- Finding 1 (product, pending decision): dock + local list are gated on
  `live()` and cleared at idle — `docs/bugs/todo-dock-idle-hidden.md`.
- Finding 2 (product, real bug): composer send is silently dropped for ~4s on a
  deep-linked session until model/agent resolve; button is enabled meanwhile —
  `docs/bugs/composer-submit-before-ready.md`.
- Tester mistakes worth remembering (all were mine, not the app's):
  - `locator.fill()` commits text into the composer but the app's editor does not
    register it — type with `pressSequentially`.
  - the send button enables reactively after typing; clicking immediately is a
    no-op → wait for enabled.
  - deep-linked sessions need `waitForComposerReady` (model chip has a label).
  - Python `urllib` API calls are 403'd by the CF edge; Node/undici fetch and the
    browser are not. Probes must go through Playwright's request context.

## 2026-09-21 — F19: todo dock persistence fix + reverse sync (push) + live on :4098

- **Todo dock (product decision: keep while unfinished).** `todoState` no longer
  takes `live()`; `"clear"` and its local-store wipe are gone; the fetch effect in
  `pages/session.tsx` lost both the idle gate and `{ defer: true }` (the defer
  meant it never ran on open). `docs/bugs/todo-dock-idle-hidden.md` (fix applied),
  unit regression in `session-composer-state.test.ts`, scenario regression is now
  `todo-dock.spec.ts` (live dock, idle persistence, reopen).
- **Reverse sync: harness → plain opencode.** `POST /experimental/motn/sync-push`,
  Settings row "Push to opencode" (`settings-motn-sync-push`); the old button is
  `settings-motn-sync-pull`. First push copied 35 sessions / 1,774 messages /
  7,640 parts / 27,446 events; plain DB now 233 sessions incl. harness-created ones.
  `docs/features/reverse-sync-push.md`.
- **M1: sync ran on the HTTP event loop and killed the server** (`ServeError`,
  exit 1 at 04:06:50). It now runs in a child process (`__motn-sync` branch in the
  entry, spawned via `process.execPath`). `docs/bugs/in-process-sync-crashes-server.md`.
- **M2: 4096 became an orphaned listener** (dead PID still holding the socket;
  `bind` → 10048, connections refused) and every watchdog restart crash-looped on
  it. **Live moved to :4098**: `harness-serve.cmd`, `harness-promote.cmd`,
  `harness-watchdog.ps1`, cloudflared `config.yml` ingress, live tunnel restarted.
  Public URL unchanged. If 4096 frees itself, moving back is a one-line change.
- **Tester additions:** `LIVE_RETRIES` (default 1) so a model-behaviour retry is
  reported as `FLAKE`, not `FAIL`; `harness-deploy-test.cmd` deploys the built
  `harness.motn` dist to the test harness (the test repo's source is a stale
  snapshot — never build from it).
- Verified: worker pull 131 rows / worker push 36,953 rows; endpoint push 200 in
  7s with `/global/health` 200 after; `live-test smoke` vs live 6/6 `PASS` on
  `0.0.0-dev-202609210812`; e2e-site suite 8/8 on test.

## 2026-09-21 – F20: PWA install on the tablet (broken icon stubs)

- **Symptom (user):** "saving it on a tablet just opens the page in chrome" — a
  shortcut, not an installed app. **Cause:** both manifest icons were git symlink
  stubs served as text bytes with `Content-Type: image/png`; Chrome refuses to
  install on invalid icons. `Page.getInstallabilityErrors` returned `[]` and all
  HTTP checks passed — only a byte-level check catches this. Class doc:
  `docs/bugs/windows-git-symlink-stubs.md` (2nd occurrence).
- **Fix:** 12 assets in `packages/app/public/` (manifest icons, favicons,
  apple-touch-icons, social-share) are real binaries committed as `100644`;
  manifest gains `description`/`lang` + both `any` and `maskable` 192/512;
  `apple-mobile-web-app-title` added; `PUBLIC_UI_PATHS` 3 → 13 so the install
  surface is credential-free (API still 401s). No service worker by design — a
  live session client must not serve offline-cached state.
- **Regression:** `@smoke` `PWA install surface: manifest and real icon images`
  (anonymous manifest fetch + PNG signature + IHDR dims per icon);
  `httpapi-ui.test.ts` public-path list extended.
- Verified: 7/7 `@smoke` vs test harness on `0.0.0-dev-202609211701`.

## 2026-09-21 – F21: promote left live down ("you died") + supervision tripwires

- **Outage 13:09:26 → 13:45:32 (~36 min).** The idle-gated promote killed the
  `:4098` agent process and the relaunch raced the port release → `ServeError`
  → exit 1; the old fallback pointed at a pre-rename binary that no longer
  exists; and the **watchdog had been dead since 04:21:47** (9.4h), so nothing
  restarted anything. The CF edge served 502s; the session was unusable.
  `docs/bugs/promote-race-no-supervisor.md` (class: deploy/restart supervision).
- **Hardening (partly from a parallel session at 13:47):** `harness-promote.ps1`
  waits for the port to be free, snapshots `motn-live.prev.exe`, verifies HTTP
  health, exits `PROMOTED`/`ROLLED BACK`/`BLOCKED` (0/5/4), and ensures a
  watchdog on every path; `harness-watchdog.ps1` gained a 2-minute heartbeat and
  a single-instance guard (`harness-watchdog\.ps1` — launcher wrappers don't
  count); `harness-watchdog.cmd` added for detached starts.
- **Tripwires:** live-tier livetest preflight is now BLOCKED
  (`status=unsupervised`) unless a watchdog runs with a fresh heartbeat
  (`supervision` block in `build.json`); `motnKnows/verify/test_harness_hosting.py`
  asserts watchdog + heartbeat + live version == pinned binary.
- Verified: KB verify 5/5; `live-test.cmd smoke` → `RESULT: PASS` on live
  (`0.0.0-dev-202609211701`), evidence
  `%TEMP%\harness.motn\livetest\20260921-135612-live-smoke`.
- Known residual: nothing supervises the watchdog itself; want systemd hosting.

## 2026-09-21 – F22: PWA display mode → fullscreen

- Product decision (tablet user): the installed app should use the whole screen
  with no status-bar strip. `site.webmanifest` `display`: `standalone` →
  `fullscreen` (Android immersive; the clock/notifications appear on a top-edge
  swipe; platforms without immersive fall back to `standalone`). The shell
  already pads with `env(safe-area-inset-*)` (`pages/layout-new.tsx`), so
  notches/cutouts stay clear.
- Display mode is install-time: an installed WebAPK picks it up on a later
  launch; uninstall/reinstall forces it immediately.
- Guards updated to assert `fullscreen`: `@smoke` PWA check in
  `packages/app/e2e-site/site.spec.ts` and
  `motnKnows/verify/test_harness_hosting.py`.
- Verified: 7/7 `@smoke` vs test harness (`0.0.0-dev-202609211818`); live promote
  and live smoke run through the idle-gated promote watcher.

## 2026-09-21 – F23: promote #2 — zombie port, and the watchdog was blind

- **Outage ~14:21 → 15:13.** The armed promote killed the `:4098` listener; the
  port stayed busy past the 60s budget, the script logged `continuing anyway`
  and launched anyway → a bound-but-unserving zombie. Its HTTP health check
  failed (so it declared `BLOCKED`) while the watchdog's **TCP-only** probe
  reported `:4098=up` for 18 minutes. Watchdog restarts then crash-looped on the
  bound port until live was moved to `:4099` by hand.
- **Root cause of the recurring "orphaned socket"** (`:4096`→`:4098`→`:4099`):
  a child process can inherit the listening socket, so `taskkill /F` without `/T`
  leaves the port bound. Promote/watchdog now kill the process **tree**.
- **Fixes:** 300s port budget + never launch while busy (`RESULT: BLOCKED port
  busy`, watchdog owns recovery); fallback clears the port first; watchdog
  health-checks `/global/health` and kills a zombie holder's tree; heartbeats
  report `up|down|zombie`; ports reconciled to `:4099` everywhere (scripts,
  autostart, idle-promote watcher, cloudflared, KB verify).
- Verified after recovery: live `RESULT: PASS` 7/7 on `0.0.0-dev-202609211818`;
  KB verify 5/5; watchdog heartbeating with health detail.

## 2026-09-22 – F24: deploy suite M0 — stable front + hermetic tier

- `motn-front.js` (Bun): fixed-port entrypoint proxy with loopback swap control
  (`GET /__front/status`, `POST /__front/upstream`), SSE streaming and WebSocket
  upgrade bridging. Proven: an SSE and a WS opened before a hot swap keep
  receiving from the old backend (34/34 and 12/12 events) while new connections
  go to the new one; plain HTTP follows the swap immediately.
- Front proxy bug found + fixed during hermetic bring-up: Bun's `fetch` hands
  over a decoded body, so forwarding `content-encoding` made browsers fail with
  `ERR_CONTENT_DECODING_FAILED`; the front now forces identity encoding upstream
  and strips hop-by-hop/encoding headers.
- Hermetic tier: isolated instance on `:4101` behind the front on `:4098`
  (roots `C:\Users\TJ\.harness.motn-hermetic`, DB seeded once from live with
  `VACUUM INTO`), creds in `live-creds.json`, tier URL in `env.ts` +
  `playwright.config.ts` → `http://127.0.0.1:4098`. Port 4100 was already taken
  by a stale node server: the deploy manager must probe for a free port.
- Watchdog supervises the front (`kind=front`, `/__front/status`) next to live
  `:4099` and test `:4097`, heartbeats read `up|down|zombie`.
- Verified: hermetic `live-test smoke` → `RESULT: PASS` 7/7 in 26s.

## 2026-09-22 – F25: deploy-cost baseline (legacy kill-then-rebind)

- Tooling: `deploy-probe.js` (2 Hz health + manifest + auth-gate sampling, SSE
  disconnect/reconnect tracking, `deploy.json` with a verdict against the
  allowance `<=3 failed / <=2s gap / <3s reconnect`) and `deploy-legacy.ps1`
  (the current kill-then-rebind algorithm, parameterized per tier, with fault
  switches: port-busy, rollback-missing, copy-truncate).
- Hermetic run (front `:4098` → backend `:4101`, same build both sides):
  **FAIL — 15 failed requests, max gap 7.2s, 5 SSE disconnects (first reconnect
  6.7s)**. Port waits and health gates don't help: kill-then-rebind has a dead
  window by construction.
- Evidence: `C:\Users\TJ\bin\evidence\deploy-baseline-20260922-hermetic.json`.
- Next: M2 gates, then M3 blue/green + drain measured against this baseline.

## 2026-09-21 – M5: name-based process kills killed the CALLING agent (twice)

- **Mistake:** cleanup used `Get-Process -Name bun | Stop-Process` and
  `Get-CimInstance ... -match "<script name>" | Stop-Process`. On Windows the
  *calling* shell's own command line contains the pattern (and the agent runtime
  is a `bun`/`opencode` process), so the filter matched the caller and the turn
  died mid-command. Observed twice: once with a blanket `-Name bun` kill, once
  with a `motn-front.js` command-line filter. In both cases the site itself was
  fine — the agent killed itself, which reads as "the agent died again".
- **Rule:** never kill by name or by a pattern that can match the caller. Kill
  explicit PIDs, exclude `$PID` (and the parent), and verify the image path +
  command line before `Stop-Process`/`taskkill`. Long-lived services are started
  through `harness-detach.ps1` (WMI-detached), which also avoids the shell
  inheriting their stdout and hanging the tool call.
- Also started this day: `motn-front.js` (stable entrypoint) validated against
  the live server — HTTP, SSE, WebSocket (PTY) pass-through and runtime upstream
  swap all work; see `docs/features/deploy-contract.md` (WIP).

## 2026-09-22 – F24: live stuck loading -> blue/green topology is live

- **Outage (user: "harness.motn is stuck in loading"):** `:4099` was bound by
  dead PID 6496 (orphaned socket again — the server crashed at 04:26:57 after
  ~13h). The watchdog correctly flagged `:4099=zombie` and tried
  `taskkill /F /T /PID 6496`, but the process no longer existed so the port could
  not be freed and restarts could not bind. Public requests hung (tunnel up,
  origin dark).
- **Response:** adopted the front-based topology now instead of moving ports
  again. cloudflared → **front `:4102`** → **backend `:4103`**; `motn-deploy.ps1`
  (`status|backend|promote|drain`) starts backends on the first free pool port
  (4103–4115), health-gates them, swaps the front and records `deploy-state.json`;
  `harness-serve.cmd [port]` is port-parameterized; watchdog v4 supervises front,
  backend, test harness and tunnels with `front:/backend:` heartbeats.
- A stuck pool port is now retired rather than reused, which removes the whole
  `4096 → 4098 → 4099` class; `promote` also sha256-verifies the copied binary.
- Verified: public `/global/health` healthy on `0.0.0-dev-202609211818` through
  the front; `live-test.cmd smoke` → `RESULT: PASS` 7/7; `motn-deploy -Action
  status` green. Details: `docs/features/deploy-contract.md`.

## 2026-09-22 – F25: reboot exposed two supervision gaps

- Box rebooted 04:45:34. Autostart brought back the live front (`:4102`),
  backend (`:4103`) and test harness (`:4097`), but:
  - **the public host served CF `1033`** — the *live tunnel* was not running. The
    autostart/watchdog tested "is any cloudflared up?", and the unrelated
    `idea-intake` tunnel made that true, so the live tunnel was skipped. Tunnels
    are now checked **per tunnel** (`39cc9b86` live, `test-harness` test).
  - **the hermetic tier stayed down** (backend `:4101`, front `:4098`) because
    only its front was supervised. The watchdog now supervises the hermetic
    backend too: start it, and if `:4101` is unusable take a fresh port from the
    hermetic pool (`4116–4125`) and repoint the hermetic front.
- Heartbeat now reads
  `front:4102=up backend:4103=up hermetic-front:4098=up hermetic-backend:4101=up test:4097=up cloudflared=N live-tunnel=… test-tunnel=…`.
- Verified after the fixes: live public + local, hermetic and test `/global/health`
  all `healthy` on `0.0.0-dev-202609211818`; watchdog v5 running.

## 2026-09-22 – F26: M1 — blue/green deploy measured, 0 failed requests

- **Tier-parameterized deploy.** `motn-deploy.ps1 -Tier live|hermetic|test`
  (front + rotating pool per tier); `motn-serve-any.cmd <tier> <port> <binary>`
  starts any tier on any port with any binary; `motn-probe.ps1` is the oracle
  (health + manifest + auth-gate sampling, `failed`/`maxGapMs`/`byStatus`).
- **Two real bugs found by running it:**
  1. every backend appended to one shared log file, and Windows locks it while an
     instance runs — so a *candidate* backend's redirection failed and it never
     started (`The process cannot access the file...`). This would have broken
     live blue/green too. Logs are now per instance (`harness-serve-<tier>-<port>.log`,
     `harness-server-<port>.log`).
  2. Windows locks a running image, so blue/green cannot overwrite the pinned
     binary. Builds are now staged as `harness\bin\motn-<tier>-<version>-<stamp>.exe`
     (unique per deploy), recorded in the state, and GC'd by `drain`.
- Also: `drain` treats a turn as in flight only if the incomplete assistant
  message is <5 min old (a stale snapshot row no longer blocks retirement).
- **Measured on the hermetic tier** (probe during a real promote):
  `RESULT: PROMOTED front :4098 -> backend :4117`, `RESULT: DRAINED turn=idle
  waited=0s`; probe **207 samples, failed 0, maxGap 678ms** (200×138, 401×69).
  Baseline for the legacy promote (F24) was 15 failed requests and 7.2s down, so
  the acceptance target (≤3 failed, ≤2s gap) is met.
- Next: M2 hardening (PID-reuse-safe kills, promote/watchdog arbitration lock,
  migration-aware cutover, v2 `SessionStatus`) and the fault-injection catalogue;
  then the same deploy path end-to-end on `test.harness`.

## 2026-09-22 – F27: sync "fail" triage + first live blue/green deploy

- User reported "sync from opencode" showing fail. **Not reproducible**: direct
  worker pull 5/5 exit 0; `POST /experimental/motn/sync` 200 in 4-5s locally and
  publicly (inserted 20-274 rows); push 200 (idempotent, `inserted: 0`). Both DBs
  are WAL with `busy_timeout 5000`, so writer contention is not it. Most likely a
  transient in the 04:44-04:50 reboot window (backend down 04:44:53 → 04:48:49,
  live tunnel missing until ~04:50) or a CF edge blip (one 502 observed on push
  that a retry cleared).
- Made failures diagnosable: `runMerge` now logs worker failures to the server
  log (`[motn-sync] pull failed (exit N): ...`) and the settings toast includes
  the HTTP status (`motn-api.ts`).
- Two deploy-manager bugs found while verifying:
  - the watchdog restarted the **retired** hermetic backend on a hardcoded
    `:4101` and swapped the hermetic front back to stale code. It now delegates
    to `motn-deploy -Action backend` so port/binary come from the tier state.
  - `Read-State` returns the full state shape now (an old state file without
    `previousBinary` aborted a live promote mid-way).
- **First live blue/green deploy**: `RESULT: PROMOTED front :4102 -> backend
  :4104 (0.0.0-dev-202609220909)`; probe on the public URL: 243 samples, **0
  failed**, 2668ms max gap; `DRAINED turn=idle waited=110s`; live smoke 7/7.
  `promote` now also updates the pinned path (not the running image in
  blue/green, so unlocked) and `live-test.ps1` reads the expected version from
  the tier state instead of the pin.
- Follow-up: the single 2.6s slow response during the swap (no failures) — add a
  warmup request through the front after swapping.

## 2026-09-22 – F28: test tier behind a front; live promotes gated

- **Phase 0 guard:** `motn-deploy.ps1 -Tier live -Action promote` now requires
  `-AllowLive`. Recovery actions (`status`/`backend`/`drain`) are never gated so a
  broken live backend can always self-heal.
- **Phase 1 (test = blue/green):** started a test front on `:4097` (tunnel target
  unchanged), moved the backend to pool port `:4126`, seeded
  `deploy-state-test.json`; `harness-deploy-test.cmd` is now an alias for
  `motn-deploy -Tier test -Action promote`; watchdog and autostart supervise the
  test **front** + test backend from the tier state (no more raw `:4097`
  restarts). Watchdog heartbeats now read `test-front:4097=… test-backend:<p>=…`.
- Two fixes found while doing it: the test tier's `pin` was the *running* image
  (so the pin-copy step hit the image lock) — the pin is now
  `harness\motn-test.exe`; and the pin copy is non-fatal (a locked pin only skips
  the compatibility copy).
- **Acceptance:** probe on `https://test-harness.motionlabs.ng` during a test
  promote → **0 failed**, maxGap 1468ms; `RESULT: PROMOTED front :4097 ->
  backend :4127`; `DRAINED waited=0s`; `live-test smoke -Tier staging` 7/7.
- Live untouched throughout (still `:4104` / `0.0.0-dev-202609220909`).

## 2026-09-22 – F29: M2 hardening + 7/7 adversarial catalogue on test.harness

- **Hardening** (`motn-deploy.ps1`, watchdog): build nonce identity
  (`/global/health` reports `build`, asserted against the staged binary's
  sha256), per-tier arbitration lock (`RESULT: BUSY` on a concurrent deploy),
  PID-reuse-safe kills (image name/path checked; never kills `powershell`),
  warmup through the front after a swap (max gap 1942ms → 517ms on hermetic),
  migration-overlap detection (`migrations=+N`), and retry across distinct pool
  ports.
- **Bugs found by running it adversarially:**
  1. the free-port probe was connect-based, so a port wedged by an orphaned
     socket looked free and the candidate could not bind → bind-based probe;
  2. the retry loop re-picked the same failed port every attempt → it now skips
     failed ports;
  3. the retry loop killed the port owner, including a healthy backend another
     actor had just started → it no longer kills ports it did not start.
- **The live front wedged** (`/__front/status` answered while a proxied request
  with a real `Host` hung → public 502). Fixes: the watchdog now health-checks
  fronts **through the proxy**, `-Action backend` reconciles the front's upstream
  with the healthy backend, and the hermetic front restart passes the state
  *path* (passing the parsed object looped it).
- **Catalogue on `test.harness` (public probe): 7/7 PASS** — `clean` (0 failed,
  723ms), `port-occupied`, `candidate-crash` (BLOCKED, site up), `rollback-missing`
  (BLOCKED, site up), `lock-race` (one PROMOTED + one BUSY), `backend-killed`,
  `front-killed`. Evidence: `C:\Users\TJ\bin\evidence\adversary-test-*.json`.
- **Live promote after the gate**: `PROMOTED front :4102 -> backend :4103
  (0.0.0-dev-202609220938)`, probe **0 failed** / 3146ms max gap, `DRAINED
  waited=40s` (a real in-flight turn — L2 held), live smoke 7/7. Live now serves
  `0.0.0-dev-202609220938` with the build nonce.
- Follow-up: live max gap was 3146ms (above the 2.5s target) — likely the swap
  plus drain on the larger live DB; investigate a stronger warmup.

## 2026-09-21 – M4: orphaned `:4098` socket; live moved to `:4099`

- The armed promote (14:23) killed the `:4098` listener and **the port never came
  back**: the `LISTENING` socket outlived its owner (netstat and
  `Get-NetTCPConnection` still report dead PID 8908; no live child holds it —
  kernel/EDR-held handle suspected, Riot Vanguard is on this box). `bind` →
  WinError 10048 → the new build and `harness-serve-old.cmd` both died on
  `ServeError` (15:11:35/15:12:04/15:12:33) and two watchdogs crash-looped. The
  promote did the right thing: `RESULT: BLOCKED`, watchdog ensured.
- **Live moved to `:4099`** in all seven scripts + `cloudflared/config.yml`
  ingress; live tunnel restarted; one watchdog started; dedupe of the extra
  watchdog. Public URL unchanged.
- Verified: local + public `/global/health` → `0.0.0-dev-202609211818`;
  `live-test.cmd smoke` → `RESULT: PASS` (7/7 incl. the supervision preflight);
  KB `test_harness_hosting.py` 5/5 on `:4099`.
- Same mechanism as the 4096 orphan (F19/M2) — **the structural fix is to stop
  kill-and-rebind on a fixed port**: start the new build on a rotating port,
  health-check it, repoint the tunnel ingress, then retire the old process.

## 2026-09-21 – F21: PWA live + M3 (the idle-gated promote left live down)

- **PWA verified on live.** Live promoted to `0.0.0-dev-202609211701` at 13:09;
  live `@smoke` 7/7 `PASS` including `PWA install surface` (manifest + real PNG
  icons fetched anonymously). Live icon bytes: 192=1601, 512=7194, apple-touch=1541.
- **M3: :4098 stayed down 13:09→13:47 ("server crashed").** Three faults:
  (1) the promote killed the listener and relaunched 13 s later, so the new
  process raced the port release and died on bind (`ServeError`, exit 1);
  (2) the fallback `harness-serve-old.cmd` pointed at the pre-rename
  `dist/opencode-windows-x64` build (gone) on :4096; (3) no watchdog was running
  — the live one had died at 04:21 still polling :4096. Fixes: `harness-promote.ps1`
  waits for :4098 to be genuinely free, snapshots the running binary to
  `motn-live.prev.exe`, verifies `/global/health` (not just the socket) with 60 s
  of retries, then falls back to the previous build; `harness-serve-old.cmd`
  serves that snapshot on :4098; the idle watcher invokes the promote with
  `cmd /c` (CreateProcess cannot execute a `.cmd`); watchdog restarted for
  4098/4097. Dry-run verified healthy without touching the running server.
- **Push sync run from the motn side** during the outage:
  `motn-live.exe __motn-sync --push` → 20,231 rows (event 15,022, message 1,047,
  part 4,156, todo 6), reconciled 233; plain opencode DB now holds today's sessions.

## 2026-09-22/23 — F30: review-panel ×; staging tier (staging-harness.motionlabs.ng)

- **Review panel close button.** The Review tab chip now has an × in both the v2
  and legacy tab strips (same closeButton pattern as the Context tab); it calls
  `view().reviewPanel.close()` and middle-click closes too. No keybind, so this
  cannot steal hard refresh the way the removed `review.toggle` did (F16).
  Commits: `dee90b6425` (fix(app)), verified in Playwright on **staging public +
  localhost** and **live public** (open → × → panel unmounts → reopen via the
  context pill); evidence `C:\Users\TJ\bin\evidence\review-close-{staging,live}-*`.
- **Staging tier** added end to end: `staging-harness.motionlabs.ng` via
  cloudflared tunnel `staging-harness` (`f42f581c-…`), front `:4136` → pool
  `4137–4146`, own root `C:\Users\TJ\.harness.motn-staging` (DB seeded one-time
  via `VACUUM INTO` from the live DB), ungated promotes, state/pin/tunnel restart
  script/watchdog/autostart/probe/adversary all wired. livetest tiers renamed:
  `test` = test-harness, `staging` = staging-harness, `live` unchanged
  (`ae63b52071`). First promote 0 failed/674ms, smoke 7/7, catalogue 7/7 (clean
  re-run after one probe-file flake).
- **Live promote of the same build** (`0.0.0-dev-202609222223`, nonce
  `011294B4…`): `PROMOTED :4102 -> :4106`, probe **0 failed / 496ms**, drain
  waited, live smoke 7/7, review-× verified live. Commits: `4acd819f43` (build
  nonce in `/global/health`), `51922b8ffc` (deploy contract).
- **M6 — cloudflared resolves tunnel names loosely.** `cloudflared tunnel route
  dns staging-harness …` (and `tunnel info staging-harness`) matched the
  `harness` tunnel, so the staging hostname's CNAME pointed at the **live**
  tunnel. Fixed by always passing the tunnel **UUID** (`f42f581c…`) and deleting
  the bad record. Same rule as M5: names are not identities.
- **M7 — WMI detach can hang a deploy.** A staging promote sat >15 min inside
  `harness-detach.ps1`'s `Invoke-CimMethod Win32_Process.Create` (broken-
  candidate path). `Start-Detached` now runs the detach as a job with a 45s cap;
  the stuck promote was killed by explicit PID. The lock still guards duplicates.
- **M8 — two more hang/kill classes in `motn-deploy.ps1`.** (a) `Wait-Backend`
  used a wall-clock deadline and an `Invoke-WebRequest` loop; it was observed
  hung >10 min (thread in ExecutionDelay) even after the detach was bounded →
  iteration-counted loop + `HttpClient` with a hard 5s request timeout. (b) a
  `drain` died mid-kill because `taskkill`'s stderr became a terminating
  `NativeCommandError` under EAP=Stop → taskkill now runs via `cmd /c` with a
  survivor check. The interrupted live drain left `previousPort: 4105` in state
  after 4105 was already dead; state was repaired by hand (drain tail).
- **Orphaned pool ports are normal now.** 4103/4104/4105 remain `LISTENING`
  with dead owners after their backends were killed — the wedgeable-socket class
  that motivated blue/green. The front never points at them; they are retired by
  design (the pool has 4107–4115 left on live).
- CF Free plan has **no cert for nested hosts**: `staging.harness.motionlabs.ng`
  fails TLS (Universal SSL covers apex + one level only), hence the one-level
  `staging-harness.motionlabs.ng`. A nested host needs Total TLS / ACM.

## 2026-09-23 - F31: public KB console at /knows/ (front-gated, watchdog-supervised)

- **What shipped** - `https://harness.motionlabs.ng/knows/` serves the KB
  console + read API behind the harness live Basic creds (realm `motn.knows`).
  `motn-front.js` now reads `front-knows.json` (`enabled`, `upstream: 7781`,
  `ports: [4102]`, creds) at boot; `/knows*` gets a constant-time Basic check,
  then proxies to the fixed `:7781` origin (never the rotating backend). Other
  tier fronts cannot expose it (port allowlist; fail-closed when config is
  missing). No cloudflared/DNS/tunnel change - same host, same TLS.
- **Origin** - the API app mounts twice (`/` local, `/knows` public); the
  console derives its base from `location.pathname`; `Cache-Control: no-store`
  on everything so phones never serve stale KB. API tests 11/11.
- **Supervision** - `harness-watchdog.ps1` now health-checks `:7781` and
  re-launches `motn-knows-api.cmd`; `harness-autostart.cmd` starts it at boot;
  heartbeat gained `kb-api=up|down`. Recovery proven: killed the daemon, back
  within seconds (`kb api :7781 unhealthy -> restarting`).
- **Pre-production proof** - the front patch was exercised on a throwaway front
  (`:7789` -> live backend): no auth 401 + realm header, live creds 200 HTML,
  `/knows/health` + `/knows/search` 200 JSON, wrong creds 401, `/global/health`
  proxying intact. Then the live front `:4102` was restarted onto it; harness
  root still 200 with creds.
- **Rule 5** - Playwright on the real public URL (desktop + mobile 390x844):
  chips 47 docs / 253 claims / 163 fact / 88 WA / index v79 / embeddings ON;
  search, doc viewer, claims table render; unauthenticated request -> 401.
  Screenshots: `C:\Users\TJ\bin\evidence\kb-console-public-*.png`.
  Docs: `docs/features/public-knows-console.md`.
- **Running backends must be restarted to pick up config** (M, same day):
  MCP + plugin load at server start, so the tiers running before the config
  change had neither (`GET /mcp` was `{}` on live). All four tiers were
  promoted onto fresh backends (live -> :4107, test -> :4127, staging -> :4137,
  hermetic -> :4116); `/mcp` now returns
  `{"motn-knows":{"status":"connected"}}` on every tier through its front.
  The auto-brief plugin rides the same restart (subagent injection re-verified
  in a real `motn-live run`: child explore session got its own 2.2KB brief).
  Claude Code got the KB MCP too (`claude mcp add -s user motn-knows -- kb.exe
  mcp`, connected); the push-brief is opencode/harness-only by construction.

## 2026-09-23 - F32: front proxy closed quiet SSE streams (Bun idleTimeout) - frozen chat UI

- **Symptom** (user report + screenshot): the web UI "very often doesn't update
  the actual state" - an assistant message froze mid-stream ("stuck for awhile")
  and tool parts sat at `running` while the server had already finished.
- **Root cause**: `motn-front.js` called `Bun.serve` with no `idleTimeout`, so
  Bun's 10s default was in force. It applies to *streaming* responses: any 10s
  gap with no bytes closes the connection mid-response. The v2 event stream
  heartbeats every **15s** (`packages/server/src/handlers/event.ts:37`), so a
  quiet stream died before its first heartbeat. Measured: through the front
  `:4102` `/api/event` died at **11.7s / 96 bytes / 0 heartbeats**, while the
  same stream direct to `:4108` held 20s+ and the v1 `/global/event` (10s
  heartbeat) barely survived.
- **Why it looked stale**: the app reconnects (250ms loop,
  `packages/app/src/context/server-sdk.tsx:220,308`) but the `server.connected`
  handler only refreshes bootstrap/directory state (`server-sync.tsx:565-571`) -
  the open session's messages/parts are never re-fetched, and missed live-only
  deltas / `*.ended` events are unrecoverable. So each cut froze the timeline at
  the drop point until route re-entry or reload; provider gaps of 1-8 minutes
  are routine here (e.g. `ses_fff393...` msg_0d0d159f: text at 20:29:36, next
  tool 20:33:32), so cuts fired constantly.
- **Fix** (shipped): `C:\Users\TJ\bin\motn-front.js` - `idleTimeout: 255` on
  `Bun.serve` + `srv.timeout(request, 0)` for `text/event-stream` requests.
  All four fronts restarted (live `:4102`->`:4108`, test `:4097`->`:4127`,
  staging `:4136`->`:4137` via watchdog, hermetic `:4098`->`:4116`). Verified:
  SSE through the front and through the public tunnel stays open **35s+ with 3
  heartbeats**; public console Playwright suite all green; harness root renders.
- **App-side follow-up (next)**: on `server.connected`, force-sync the open
  session (`session.sync(id, { force: true })`); the merge engine is already
  refresh-safe (`server-session.test.ts:1013`). Until that lands, any future
  stream loss (tunnel/deploy/network) still leaves the visible timeline stale.












