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
