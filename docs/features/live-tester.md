# live-tester (`livetest`)

Shipped 2026-09-21. Verifies a **deployed** harness build by driving it like a
user. Replaces one-off Playwright scripts with a repeatable runner that always
leaves a machine-readable evidence bundle.

## Usage

```
live-test.cmd smoke                    # read-only @smoke suite (default tier: live)
live-test.cmd scenario todo-dock       # one @scenario test (default tier: staging)
live-test.cmd all                      # every test under packages/app/e2e-site
live-test.cmd scenario nothing -Tier hermetic      # example of a BLOCKED run
```

Options: `-Tier hermetic|staging|live`, `-Budget <usd>`, `-Keep`, `-Headed`,
`-Evidence <dir>`. `site-test.cmd` is a deprecated alias for `smoke`.

Exit codes: `0` PASS, `1` FAIL, `2` FLAKE, `3` SKIP, `4` BLOCKED.
`SKIP` never counts as a pass.

## Tiers

| Tier | Target | Use |
| --- | --- | --- |
| `hermetic` | `http://127.0.0.1:4099` (throwaway server + data dir) | destructive/experimental scenarios, no cost |
| `staging` | `https://test-harness.motionlabs.ng` | default for `@scenario`; real build + real model |
| `live` | `https://harness.motionlabs.ng` | `@smoke` and the promote gate |

Model-calling tests are refused on `live` unless `LIVE_ALLOW_LIVE_MODEL=1`.

## Evidence

`%TEMP%\harness.motn\livetest\<stamp>-<tier>-<mode>\` (last 20 kept):

- `build.json` — check #0: tier, target, target's `/global/health` version,
  expected version, pinned binary sha256 + mtime. `version-mismatch`,
  `unhealthy`, or `unreachable` aborts the run as `BLOCKED` before any assertion.
- `report.json` / `report.md` — verdict, per-test status, durations, retries, errors.
- `preflight.log`, `playwright.log`
- `<test>.sse.jsonl` — raw server events captured during the test
- `<test>.api.jsonl` — server-side ground truth (status, messages, todos, cost)

## Layout

```
packages/app/e2e-site/
  playwright.config.ts     reporter + evidence env; no webServer
  site.spec.ts             @smoke: home, search, settings, Thinking, No-response, auth gate
  support/env.ts           tier/URL/creds/budget/gates
  support/api.ts           v1 HTTP client + waitIdle/waitFor helpers
  support/events.ts        SSE journal
  support/app.ts           sessionHref, console-error tracking
  support/composer.ts      openSession, submitPrompt, waitForPromptAdmitted
  support/evidence.ts      evidence dir + jsonl/json writers
  support/preflight.ts     build identity + reachability (exit 4 on failure)
  support/reporter.ts      report.json + report.md
```

Runner: `C:\Users\TJ\bin\live-test.cmd` → `live-test.ps1`, creds in
`C:\Users\TJ\bin\live-creds.json` (per tier).

## Scenario conventions

- Tag tests `@smoke` (no model calls) or `@scenario` (real turn; `@scenario` tests
  that prompt also carry the `@model` gate via `env.modelAllowed()`).
- Sessions created by a scenario use the title prefix `livetest:<scenario>:<utc>`
  and are deleted at the end unless `LIVE_KEEP=1`.
- Assert server ground truth (API) before trusting UI state; the UI is the
  thing under test, the API is the oracle.
- A scenario needs a stable hook (`data-component`/`data-slot`/`data-action`) or
  the missing hook is filed as an app bug, not worked around in the test.

## Regression

`site.spec.ts` (6 tests, `@smoke`) is the pre-existing deployed-site suite,
retagged and moved onto this runner; run it after every promote:
`live-test.cmd smoke` → expect `RESULT: PASS`.
