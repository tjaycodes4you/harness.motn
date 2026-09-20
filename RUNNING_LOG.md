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
