# Todo dock disappears (and its list is cleared) when the session is idle

Class: session-composer state gating. First seen 2026-09-21 ("the todo doesn't
really work right now").

## Symptom

A session with unfinished todos shows no todo dock unless a turn is currently
running. Returning to a session — or watching a turn finish — the dock is gone
even though the server still has `pending`/`in_progress` items.

## Trigger

1. Run a turn in which the model calls `todowrite` (dock renders mid-turn).
2. Let the turn finish, or reopen the session while idle.
3. Expected: the dock still shows the unfinished list. Actual: no dock.

## Root cause

`packages/app/src/pages/session/composer/session-composer-state.ts`:

- `dock()` requires `todos().length > 0 && !done() && live()` (line 67), where
  `live()` is `session_working(id) || blocked()` (line 62).
- `todoState()` returns `"clear"` for `count > 0 && !live` (lines 13-24), and the
  `"clear"` branch calls `clear()` (line 137), which writes `[]` into the local
  todo store (lines 114-118).

The client also only *fetches* todos when the session is busy or blocked:
`packages/app/src/pages/session.tsx:911` returns early on
`status === "idle" && !blocked`, and `context/server-session.ts:1381` skips the
request when a cached value exists. So on open, an idle session has no list, and
once one exists it is wiped as soon as the session goes idle.

## Evidence

`livetest` pilot `todo-dock` (2026-09-21T07:33, staging, build
`0.0.0-dev-202609210455`), evidence bundle
`%TEMP%\harness.motn\livetest\20260921-033341-staging-scenario`:

- server list: `alpha:in_progress`, `beta:pending`
- dock frames while live: 173 / 612, states observed `pending, in_progress`
- **dock present after idle: false**

## Fix

Not yet applied — needs the product call on intended idle behaviour: keep the
dock while the session has unfinished todos (fetch on open, stop requiring
`live()`), versus the current upstream design of scoping the dock to the live
turn. Once decided, the pilot scenario becomes the regression test.

## Commentary

The existing mock regression (`packages/app/e2e/regression/session-todo-dock-navigation.spec.ts`)
only covers "closes after the final todo" and "does not replay across tabs"; the
idle-with-unfinished-todos case was never asserted, which is why this shipped
unnoticed.

## Related

- `docs/features/live-tester.md`
- `packages/app/src/pages/session/composer/session-todo-dock.tsx`
