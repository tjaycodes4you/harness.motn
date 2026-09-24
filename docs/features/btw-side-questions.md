# /btw - side questions in a fork

`/btw <question>` asks a question without derailing the main conversation or
waiting for it: the session is forked as it stands, the question is asked in the
fork, and the fork opens in its own tab scrolled to the answer
(2026-09-24, build `0.0.0-dev-202609241151`).

## Why a fork

The main session is a serialized runner: a message sent while a turn (or a
subagent) is running is queued until the current provider turn ends. A side
question therefore cannot ride the main session. A fork is a full transcript
copy with its own session id (`Session.fork`,
`packages/opencode/src/session/session.ts:693`), so it runs in parallel, and the
side exchange never lands in the main transcript.

## Flow

1. `/btw <question>` is intercepted in the composer submit path
   (`packages/app/src/components/prompt-input/submit.ts`) for normal-mode sends
   in an existing session. Shell mode and new-session drafts are untouched.
2. `startSideQuestion`:
   - `api.session.fork({ sessionID })` - the fork copies every message/part up
     to now into a new session (same directory).
   - `api.session.rename(...)` to `btw · <question>` (80-char cap).
   - A message id is generated up front and registered as
     `layout.pendingMessage` for the fork's session state key - the existing
     scroll handoff, so the fork tab opens at the question instead of the top
     of the copied history.
   - `tabs.addSessionTab({ server, sessionId })` + `tabs.select(tab)` opens the
     fork as a tab (the main session stays in its own tab and keeps running).
   - `api.session.prompt(...)` with the question, the current agent/model, and
     that message id.
3. The fork answers in its tab; switch back whenever. The main transcript is
   untouched by design.

## Verification

Playwright on test (`0.0.0-dev-202609241151`) and staging (`:4146`), script
`%TEMP%\harness.motn\btw-verify.py`:

- Main session seeded with "Remember the codeword is ZEBRA" and left busy with
  a `ping -n 46` foreground subagent.
- `/btw What codeword did I tell you?` typed into the real composer.
- Navigated to the fork tab; the question was in view (y=623, scroll handoff
  works), the fork transcript contains the `ZEBRA` answer, and the main task
  was **still running** when the answer was produced - the side question did
  not wait.
- The main session's transcript contains no trace of the side question.
- 0 page errors.

## Limits

- The fork is a real session: it appears in the session list under its
  `btw · ...` title (nothing is deleted or hidden yet). Close its tab when
  done.
- Forking copies the whole transcript (no message-point selection), which is
  the intent for a side question but costs storage on long sessions.
- The topic brief plugin injects the motn-knows brief into the fork's first
  message like any fresh session.
