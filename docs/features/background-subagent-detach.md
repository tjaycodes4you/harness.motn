# Subagent detach: "Continue in background" on a running task

A foreground subagent blocks its parent turn until it finishes, so any message
you send while it runs is queued behind it (2026-09-24, build
`0.0.0-dev-202609241114`). The task card now offers a button that detaches the
subagent into the background so the chat keeps moving.

## Why it blocked

The v1 runner serializes a session: a prompt submitted while a run is active is
deferred until the next provider-turn boundary (`packages/opencode/src/effect/runner.ts:115`).
The Task tool's foreground path awaits the whole child turn inside the parent's
provider turn (`packages/opencode/src/tool/task.ts:317`), so no boundary exists
until the child finishes. Measured on test: a ~31s subagent held a follow-up
message for **34.4s**, answered at the exact moment the task completed.

The server already had the machinery behind
`OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS`:

- `background: true` task launches return immediately and the result is injected
  into the parent as a synthetic `<task ...>` message when done (`task.ts:216-307`).
- `BackgroundJob.promote(id)` flips a *running foreground* job's metadata to
  `background`, which makes the blocked tool call return "Background task
  started" while the job keeps running (`packages/core/src/background-job.ts`).
- `POST /experimental/session/:sessionID/background` promotes every blocking
  task job in a session (`handlers/experimental.ts:159`), gated on the flag and
  advertised by `GET /experimental/capabilities` (`backgroundSubagents`).

## What shipped

- **Ops**: `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true` for the test and
  staging tiers in `C:\Users\TJ\bin\motn-serve-any.cmd` (live held).
- **App**: `DirectoryDataProvider` fetches capabilities once per server and
  provides `backgroundSubagents` + `sessionBackground` through the session-ui
  data context (`packages/session-ui/src/context/data.tsx`). The detach call is
  a raw `motnPost` (`packages/app/src/utils/motn-api.ts`), with an error toast.
- **Task card** (`packages/session-ui/src/components/message-part.tsx`): while a
  task is `running`, not already background, and the server supports it, a
  ghost icon button (new `background` icon, tooltip "Continue in background")
  sits next to the card's open-in-session action. New keys
  `ui.tool.task.background.{action,label,failed}` in all 18 locales; the
  previously hardcoded `(background)` subtitle suffix now uses the label key.

## Verification

- API on test (build `0.0.0-dev-202609241114`, backend `:4133`): follow-up
  admitted +2.6s, detach +4.1s -> tool part `completed (background=True)` at
  +0.0s and the follow-up answered +0.0s after the detach (baseline without
  detach: +34.4s). The subagent kept running and its result was injected at
  +37.5s as a synthetic `<task id=... state="completed">` message.
- Browser (Playwright): button visible during the task; click -> card reads
  `General Ping last line (background)`, button hides, the model continues the
  turn ("The task is running in background."), 0 page errors, server metadata
  `background=true jobId=<child session>`.
- Repros in `%TEMP%\harness.motn\`: `subagent-block-repro.py` (before),
  `subagent-detach-verify.py` (after), `subagent-detach-browser.py` (UI).

## Result visibility and per-task stop (F41, build `0.0.0-dev-202609242025`)

- The notification the background job injects into the parent now carries
  `metadata.backgroundTask = { sessionID, state, title }` (`packages/opencode/src/tool/task.ts`),
  and `state` includes `cancelled` (previously a cancelled job was silent to the
  model: `notify` only handled `completed`/`error`).
- The app renders those synthetic messages as a notice card -
  "Background task finished/failed/stopped: <title>" with an **Open task** link
  to the child session (`packages/session-ui/src/components/message-part.tsx`,
  `message-part.css`); the raw `<task ...>` XML stays model-only.
- **Stop task**: a background card whose child session is still busy shows a
  ghost stop button. It calls the new flag-gated route
  `POST /experimental/session/:sessionID/background/cancel` with the job id
  (`jobId` optional - omitting it cancels every running background task in the
  session). Cancelling interrupts the job, which aborts the child run and
  injects the `cancelled` notice.
- Verified on test and staging (`%TEMP%\harness.motn\background-result-verify.py`):
  completed task -> notice + working "Open task" link; clicking Stop at +6.5s ->
  cancelled notice at +8.3s, child session idle, child message `MessageAbortedError`,
  0 page errors.

## Long-work policy, TUI parity, restart durability (F43, build `0.0.0-dev-202609242356`)

- **Policy.** The task tool's background description and the `background`
  parameter annotation now tell the model to prefer background mode for
  long-running independent work (builds, full test suites, large refactors) and
  to keep foreground when the next step needs the result. Verified live on test:
  `GET /experimental/tool` returns both strings.
- **TUI parity** (`packages/tui/src/routes/session/index.tsx`):
  - Synthetic notices (`metadata.backgroundTask`) render as a notice row
    (finished/failed/stopped + title) instead of an empty message; clicking
    navigates to the child session.
  - A "Stop background tasks" palette command calls
    `experimental.session.background.cancel` (typed SDK method
    `client.experimental.session.background2.cancel`; the generated name is
    `background2` because `background` already names the detach method).
    Keybind `session.background.cancel` defaults to `none`; enabled only while
    a background task's child session is still busy.
  - Not terminal-render-verified (no PTY harness in this environment); logic
    mirrors the browser-verified app gates, TUI typecheck clean, TUI suite
    192 pass / 1 pre-existing Windows path-separator failure.
- **Restart durability.** A background task now writes a marker file
  (`<data>/background-jobs/<child session>.json`, `packages/opencode/src/background/marker.ts`)
  when it starts or is detached, and removes it after the completion notice is
  delivered. On boot, `BackgroundRecovery.init()` (wired into
  `InstanceBootstrap`, `packages/opencode/src/background/recovery.ts`) reconciles
  markers for its directory: still-running parts are marked
  `error/interrupted`, the completion notice the dead process never delivered is
  appended (state `error`, same synthetic shape the UI already renders), the
  child's dangling assistant turn is finalized with `MessageAbortedError`, and
  the marker is removed. Verified end-to-end on test and staging
  (`%TEMP%\harness.motn\durability-verify.py`): detach -> marker exists -> kill
  the backend process -> `-Action backend` -> notice injected, marker gone,
  child `MessageAbortedError`.
- **Pool sweep.** `-Action promote` now reaps orphaned `motn-<tier>-*` backends
  before staging its candidate and after the swap; `-Action drain` reaps after
  retiring the previous backend. This is inline insurance on top of the F42
  watchdog sweep (every 5 min). Verified by starting a stray backend on a free
  test-pool port: `-Action reap` -> `REAPED 1`, port free.
- **Endpoint tests.** `httpapi-exercise` covers the cancel route, and
  `test/server/httpapi-experimental.test.ts` asserts both background routes are
  no-ops (`200 false`) without running subagents. Note: the harness shell
  exports `OPENCODE_SERVER_PASSWORD` / `OPENCODE_CONFIG_DIR` / `OPENCODE_DB`
  (inherited from the running agent); tests must run with those cleared or every
  protected route answers `401` and `registry.tools` sees the real config.

## Limits

- A restart notice is only written when the parent tool part for the task is
  still present; markers for deleted sessions/parts are dropped silently.
- `BackgroundJob` is process-local and in-memory; durability covers the parent
  notification and child session state, not resuming the job itself.
- Tier pools still fill if a promote is killed before its post-swap reap; the
  F42 watchdog sweep is the backstop.
