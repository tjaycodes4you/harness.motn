# PWA install (tablet / desktop)

Shipped 2026-09-21 (build `0.0.0-dev-202609211701`). Before this, "Add to Home
screen" on a tablet produced a plain Chrome shortcut instead of an installed app.

## What was broken

The manifest was fine (`name`/`short_name` `motn`, `start_url` `/`,
`display: standalone`) but **both manifest icons were broken files**. They are git
symlinks (`mode 120000`) pointing at `packages/ui/src/assets/favicon/*.png`; this
Windows checkout has `core.symlinks=false`, so git materialized each link as a
56-byte text file holding the target path. The server still mapped the extension
to `Content-Type: image/png`, so every HTTP-level check passed while Chrome
received non-image bytes and quietly refused the install. See
`docs/bugs/windows-git-symlink-stubs.md`.

## What install needs (Chrome, 2024 criteria)

Per `web.dev/articles/install-criteria`, on top of HTTPS and the engagement
heuristics (`beforeinstallprompt` only fires after a tap and ~30s): a manifest
with `short_name`/`name`, 192px **and** 512px icons, `start_url`, a `display` of
`standalone`/`minimal-ui`/`fullscreen`, and no `prefer_related_applications`. A
service worker is **not** required, and this app intentionally ships none —
it is a live client for a local server, offline caching would serve stale state.

## Changes

- `packages/app/public/` — the 12 symlink stubs (manifest icons, favicons,
  apple-touch-icons, social-share) are now **real binaries committed as regular
  files** (`mode 100644`). `site.webmanifest` gains `description`, `lang`, and
  both `any` and `maskable` 192/512 entries.
- **Display mode is `fullscreen`** (product decision, 2026-09-21): the installed
  app fills the whole screen with no status-bar strip; the clock and
  notifications appear when the user swipes down from the top edge, and the
  manifest falls back to `standalone` on platforms without immersive mode. The
  app already pads its shell with `env(safe-area-inset-*)`
  (`pages/layout-new.tsx`), so notches/cutouts stay clear. Display mode is fixed
  at install time — an already-installed WebAPK picks it up on a later launch
  (uninstall/reinstall forces it immediately).
- `packages/app/index.html` — `apple-mobile-web-app-title` = `motn` (iOS uses it
  for the home-screen label).
- `packages/opencode/src/server/shared/public-ui.ts` — the auth-bypass list grows
  from 3 paths (manifest + 2 icons) to 13, adding the favicons, apple-touch-icons,
  and social-share images: browsers fetch all of these outside page-auth control,
  and none carry user data. Everything else, including `/config` and the API,
  stays behind Basic auth.
- `packages/app/e2e-site/site.spec.ts` — new `@smoke` check
  `PWA install surface: manifest and real icon images`: fetches the manifest
  without credentials, asserts the fields Chrome requires, then downloads every
  icon anonymously and verifies its PNG signature, size (>100 bytes), and IHDR
  dimensions against the declared `sizes`.

## Verification

- `bun run test:site --grep @smoke` vs test harness (`:4097`) on
  `0.0.0-dev-202609211701` → 7/7 passing, including the new PWA check.
- Anonymous fetches: `/site.webmanifest`, `/web-app-manifest-{192,512}x512.png`,
  `/apple-touch-icon-v3.png` → 200 with real PNG bytes; `/config` still 401.

## Notes

- **iPad:** Chrome on iOS cannot install PWAs at all; the equivalent is Safari →
  Share → Add to Home Screen. The `apple-*` meta tags and `apple-touch-icon` are
  what make that open standalone on iOS.
- **Basic auth in standalone:** Chrome caches HTTP credentials per session, so a
  cold launch of the installed app may prompt once. The install path itself no
  longer depends on credentials (see the public-path list). If the prompt becomes
  annoying, the follow-up is a cookie-based session for the shell rather than
  making more paths public.
- `start_url` is `/` — the home screen with the project/session list; the server
  keeps its own notion of the active project.
