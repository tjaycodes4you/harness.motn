# Stale timeline after an event-stream loss

Class: UI shows pre-disconnect session state. Reported 2026-09-23 ("very often
the frontend doesn't update the actual state of the chat sessions", frozen
mid-stream message screenshot); same session machinery also left tool parts at
`running` after the server had finished them.

## Symptom

An assistant message freezes mid-stream and never fills in; tool parts sit at
`running`; the session list status lags. Nothing reconciles until the user
leaves and re-enters the session (the timeline only force-syncs on route entry
when the cache is older than 15s) or reloads the page.

## Root cause (two halves, both required)

1. **The front proxy killed quiet streams.** `motn-front.js` ran `Bun.serve`
   without `idleTimeout`, so Bun's 10s default applied to streaming responses:
   any 10s without bytes closed the connection mid-response. The v2 event
   stream heartbeats every 15s (`packages/server/src/handlers/event.ts:37`), so
   a quiet stream died before its first heartbeat. Measured through `:4102`
   `/api/event`: **11.7s / 96 bytes / 0 heartbeats** (direct to the backend the
   same stream held 20s+).
2. **Reconnect did not rehydrate the open session.** The app reconnects on
   stream error (`packages/app/src/context/server-sdk.tsx`, 250ms loop), but
   the `server.connected` handler refreshes bootstrap/directory state only
   (`packages/app/src/context/server-sync.tsx:565-571`). The event stream is
   live-only - deltas missed while it was down are unrecoverable - so the
   visible timeline stayed frozen exactly where the stream died. Provider gaps
   of 1-8 minutes are routine on this box, so cuts fired constantly.

## Fix

- `C:\Users\TJ\bin\motn-front.js`: `idleTimeout: 255` on `Bun.serve` and
  `srv.timeout(request, 0)` for `text/event-stream` requests.
- `packages/app/src/pages/session.tsx`: force-sync the open session
  (`sync().session.sync(id, { force: true })`) on `server.connected` /
  `global.disposed`, on `visibilitychange` -> visible, and on `online`.
  Refetching is safe: the merge engine preserves non-durable deltas received
  before a refresh (`packages/app/src/context/server-session.test.ts:1013`).

## Evidence

- Front fix: SSE through the front and the public tunnel stayed open 35s+ with
  3 heartbeats (was: dead at 11.7s, zero heartbeats); public console Playwright
  suite and harness root re-verified.
- App fix: `packages/app/e2e/regression/session-timeline-transport.spec.ts` -
  "rehydrates the open session after a reconnect" and "rehydrates the open
  session when the page comes back online". Verified red without the page
  change and green with it (2026-09-23); full transport spec 10/10.

## Follow-ups landed (2026-09-24, same class)

- **TUI parity**: `packages/tui/src/context/sync.tsx` force-resyncs the open
  session on `server.connected` (external TUI SSE mode) and after
  `server.instance.disposed` (in-process TUI); covered by new cases in
  `sync-live-hydration.test.tsx`.
- **Stall watchdog**: `packages/app/src/context/server-sdk.tsx` aborts an
  event-stream attempt after 40s with no bytes on the wire, so a half-open
  stream (network swap, sleeping tab) reconnects instead of leaving the UI
  frozen. See RUNNING_LOG F34.

## Related

- `RUNNING_LOG.md` F32
- `docs/features/deploy-contract.md` (front proxy idle timeout note)
