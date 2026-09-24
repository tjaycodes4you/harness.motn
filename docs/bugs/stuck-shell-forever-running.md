# Shell tools stuck `running` forever (turn held open)

Class: process completion keyed on stdio close. Found 2026-09-24 while fixing
the queued "forever-running shell" bug; the web UI (F32) and the stall watchdog
(F34) made it visible again because a stuck part stays stuck even on reconnect.

## Symptom

A `bash`/shell tool part shows `running` forever (elapsed keeps counting). The
assistant turn never finishes; the session stays "working" until the user
interrupts. Reproduces with any command whose direct child exits while a
descendant keeps the inherited stdio pipes open (e.g. a background process
started without redirection, `cmd /c start ...`, `sh -c 'server &'`).

## Root cause

`packages/core/src/cross-spawn-spawner.ts` resolved the exit `Deferred` only on
Node's `'close'` event, which fires after the child's stdio streams end. If a
grandchild inherited those pipes, `'close'` never fires, so:

- `handle.exitCode` never resolves (the shell tool's completion race hangs),
- `collectStream(handle.all)` never ends (v2 `AppProcess.run`),
- `kill()`/scope finalizers await the same `Deferred` and hang too,
- and the runner's `FiberSet.awaitEmpty(toolFibers)` never completes, holding
  the turn open.

## Fix

Resolve the drain after `'exit'`: once the direct child is gone, push EOF
(`stdout.push(null)` / `stderr.push(null)`) after a 500ms drain so `'close'`
fires and every waiting path settles. Normal commands still finish on their own
`'close'` well inside the drain, so their output is unchanged; backgrounded
descendants no longer hold the tool open.

Also: the shell tool part now renders a live elapsed ticker while running
(`packages/session-ui/src/components/message-part.tsx`).

## Evidence

`packages/core/test/process/process.test.ts` - "settles when a descendant keeps
the stdio pipes open": spawns a child that backgrounds a grandchild with
inherited stdio and exits; asserts the run settles with `exitCode 0`, the
written stdout, and `< 2s` wall time (without the fix it waits for the
grandchild to die, ~2.5s).

## Deferred (deliberately)

The original plan also listed a per-tool kill endpoint and a startup sweep
marking orphaned `running` parts `interrupted`. With the root cause fixed new
hangs stop; the existing session-level Stop already interrupts in-flight tools,
the v2 runner fails interrupted tools at run start, and the app has orphan-part
handling. Revisit if a stuck row is still observed after this lands.
