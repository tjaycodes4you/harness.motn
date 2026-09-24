# Queued message visibility in the timeline

A follow-up submitted while the session is busy used to render a "Thinking"
shimmer immediately, even though the runner had not picked it up yet. The
timeline now shows a distinct `Queued` marker until the turn actually starts
(2026-09-24, build `0.0.0-dev-202609240932`).

## Why the message waited

The app's default follow-up behavior is steer (`general.followup`; the local
"queue" mode is retired and rewritten to `steer` in
`packages/app/src/context/settings.tsx`). On the v1 runtime a prompt submitted
while a run is active is deferred by the runner:

- `packages/opencode/src/effect/runner.ts:115` - `ensureRunning` while
  `Running`/`ShellThenRun` only awaits the current run; while `Shell` it parks
  the work as `ShellThenRun`. The running loop picks the message up at its next
  provider-turn boundary. The user message is persisted and evented
  immediately, so it is visible long before it is processed.

The timeline could not tell "this turn is being worked on" from "this turn is
waiting its turn": `activeMessageID` is simply the last user message
(`packages/app/src/pages/session/timeline/rows.ts`), so the last turn rendered
`Thinking` whenever the status was busy.

## Detection

A turn is queued when it has no assistant message of its own and an earlier
turn still has an assistant message without `time.completed`:

```ts
const streamingTurnIndex = turns.findLastIndex((turn) =>
  turn.assistants.some((message) => message.time.completed === undefined && !message.error),
)
// queued = status !== "idle" && streamingTurnIndex >= 0
//       && index > streamingTurnIndex && turn.assistants.length === 0
```

This holds for a provider turn in flight, for a running shell (`ShellThenRun`),
and after an interrupt (the interrupted assistant keeps its error, the queue
still shows). Multiple queued messages each get their own marker; the first
starts when the current turn ends, the rest follow.

## UI

- `TimelineRow.Queued` (`timeline-row.ts`, key `queued:<userMessageID>`).
- `rows.ts`: queued turns push `Queued`, and skip `Thinking`/`Retry` (the
  retry state belongs to the active turn, not to a waiting message).
- `message-timeline.tsx`: renders the row where the shimmer would be - clock
  icon + `ui.sessionTurn.status.queued` - styled by `session-turn-queued` in
  `packages/session-ui/src/components/session-turn.css`. The key was added to
  all 18 locales in `packages/ui/src/i18n/`.

## Verification

- Unit: `packages/app/src/pages/session/timeline/rows-current.test.ts` - queued
  vs thinking vs retry vs idle, multiple queued. Red without the `rows.ts`
  change (2 new cases fail), green with it; app suite 700/700.
- Live e2e on the test tier (build `0.0.0-dev-202609240932`, backend `:4132`):
  `POST /session/:id/shell` with `ping -n 25 127.0.0.1` holds the runner for
  ~25s; `POST /session/:id/message` while it runs. Playwright saw
  `[data-timeline-row="Queued"]` (text "Queued") with `UserMessage` x2 and zero
  `Thinking` rows during the hold; after the shell ended the marker cleared and
  the response streamed in. Session `ses_f2d394f27ffeQwtglpuOnt1Lxg`.
- Regression: `packages/app/e2e/regression/queued-message-visibility.spec.ts`
  (fixture transport: seeded streaming turn + follow-up -> `Queued`; assistant
  for the follow-up -> marker clears).

## Gotchas

- Scripted prompts go to `POST /session/:id/message` (`SessionPaths.prompt`);
  `POST /session/:id/prompt` is not a route and falls through to the SPA
  catch-all (HTTP 200 with HTML), which silently no-ops test setups.
- A follow-up is only "queued" while a run holds the session. Once the runner
  reaches it, the regular `Thinking` / streaming states take over.
