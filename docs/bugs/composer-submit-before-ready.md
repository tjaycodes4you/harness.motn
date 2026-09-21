# Composer submit is silently dropped before model/agent resolve

Class: UI enabled before dependent state. Found 2026-09-21 while building
`livetest` scenarios (deep-linking into a session in a fresh browser profile).

## Symptom

Open a session by URL in a fresh profile, type a prompt and press send within
the first ~4 seconds: nothing happens. The draft stays in the composer, no
request is made, and there is no visible error in the console.

## Trigger

1. `POST /session` (or share a session URL), then navigate straight to
   `/server/<b64>/session/<id>` in a context with no prior app state.
2. Type immediately and click send (the button is enabled).
3. Expected: the prompt is accepted (or the button is disabled until it can be).
   Actual: silent no-op; after ~4s the same click works.

## Root cause

`packages/app/src/components/prompt-input/submit.ts:329-339` bails when
`local.agent.current()` or `local.model.current()` is unresolved (it can show a
"model/agent required" toast and returns). The send button's `disabled` only
covers `!working() && blank()` (`packages/app/src/components/prompt-input.tsx:1581`),
so it is clickable while the selection is still loading. The composer's agent /
model chips are not rendered until then, which is the only readiness signal.

## Evidence

Probes on staging, build `0.0.0-dev-202609210455` (2026-09-21T07:2x):

- deep-link, click at t≈2s: no request, draft retained (`probe-race`)
- deep-link, click at t≈10s: `POST /session/<id>/prompt_async`, draft cleared
- home → open session → click: request sent immediately (`probe-home`)
- chip DOM sample: agent/model chips absent until t≈4.0s

Scenario `turn-lifecycle` now waits for the model chip
(`[data-action="prompt-model"]` with a non-empty label) before submitting;
before that wait it failed with "prompt was never admitted".

## Fix

Not yet applied. Options: disable submit until the selection resolves, or queue
the submit and flush when ready. A regression test can assert the button is
disabled while the model chip is absent.

## Related

- `docs/features/live-tester.md`
- `packages/app/e2e-site/support/composer.ts` (`waitForComposerReady`)
