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









