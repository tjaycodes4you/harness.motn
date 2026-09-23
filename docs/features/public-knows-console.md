# Feature: public KB console at `harness.motionlabs.ng/knows/`

## What

The read-only motn.knows console (search / docs / claims) is reachable on the
move at `https://harness.motionlabs.ng/knows/`, behind HTTP Basic with the
harness live credentials (realm `motn.knows`).

## How

- **Origin**: the KB read API (`C:\Users\TJ\PycharmProjects\motn.knows-api`,
  FastAPI) listens on `127.0.0.1:7781` and serves the same app twice:
  `/` (local) and `/knows` (public mount). The console derives its API base
  from `location.pathname`, so one `index.html` works at both prefixes.
- **Front**: `motn-front.js` reads `C:\Users\TJ\bin\front-knows.json` once at
  boot. If `enabled` and the listen port is listed (`ports: [4102]` only),
  requests to `/knows` / `/knows/*` must pass a constant-time Basic check
  against the configured credentials before being proxied to `:7781`; failures
  get `401` + `WWW-Authenticate: Basic realm="motn.knows"`. All other paths and
  ports are untouched. Missing/disabled config = fail-closed (upstream 404).
- **Supervision**: `harness-watchdog.ps1` polls `:7781/health` every cycle and
  re-launches `motn-knows-api.cmd` detached when down; `harness-autostart.cmd`
  starts it at boot. Heartbeat line includes `kb-api=up|down`.
- No cloudflared / DNS / tunnel changes: the tunnel still targets the front.

## Why

Operator access to the KB from a phone, without opening a new public surface:
same TLS host, same credential perimeter as the harness site itself, and the
gate lives in our code (not a dashboard setting).

## Verification

- Rule 5 (browser, real URLs): Playwright on
  `https://harness.motionlabs.ng/knows/` with `http_credentials` — home chips,
  search hits, doc viewer, claims table, mobile 390x844 viewport all render;
  unauthenticated request → 401; harness root still loads after the front
  restart. Screenshots: `C:\Users\TJ\bin\evidence\kb-console-public-*.png`.
- Front gate pre-tested on a throwaway front (`:7789` → live backend) before
  touching production `:4102`.
- Recovery: killed the `:7781` daemon; watchdog restored it within seconds
  (log: `kb api :7781 unhealthy -> restarting`).

## Operations

- Rotate credentials: edit `front-knows.json` (currently mirrors
  `live-creds.json`) and restart the live front.
- Disable: `"enabled": false` (or remove the file) + restart the live front.
- The API is read-only; the console exposes KB content (claims, selector keys,
  env pointers) to anyone with those credentials — same perimeter as the
  harness UI.
