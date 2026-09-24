# Mobile UX: composer controls, tab strip scroll, in-session switch

Three mobile fixes shipped together (2026-09-24, build `0.0.0-dev-202609240827`).

## Composer: send button no longer overlaps the "thinking effort" button

The prompt-input bottom row is a `flex-1 min-w-0` cluster of controls (attach,
agent, model, variant) followed by the Send button. The model/variant controls
are `ButtonV2`s wrapped in `TooltipV2` trigger `<div>`s, whose default
`min-width: auto` stopped them shrinking, so at ~390px they overflowed the
cluster and drew over the Send button (measured 28x28 overlap).

- Cluster: `overflow-hidden` so a control can never paint over Send.
- Model/variant/agent `TooltipV2` triggers: `min-w-0 flex`.
- Select button + its label span: `min-w-0` (so text truncates).
- Attach + Send: `shrink-0`.

Files: `packages/session-ui/src/v2/components/prompt-input/index.tsx`,
`packages/app/src/components/prompt-input-v2.tsx`.

## Session tab strip: scroll instead of collapsing

Tab slots were `w-56 flex-shrink` inside a `w-full` list, so tabs shrank to
~76px slivers and `overflow-x-auto` never engaged — only ~2 were legible in
portrait. Now slots are `w-40 shrink-0 md:w-56 md:shrink` and the list is
`w-max md:w-full`, so on mobile tabs hold 160px and the strip scrolls
(desktop behavior unchanged). File: `packages/app/src/components/titlebar-tab-strip.tsx`.

## Resume an old session from inside a session

A "Switch session" (history icon) button next to "+" in the titlebar opens the
existing `DialogHomeCommandPaletteV2` for the current server; selecting a
session opens it in a tab (same flow as the home palette). File:
`packages/app/src/components/titlebar.tsx` (+ `history` icon in
`packages/ui/src/v2/components/icon.tsx`).

## Verification

Playwright at 390x844 (iPhone UA, touch) against test and live: composer
overlap = 0, 3 tabs scroll (`scrollWidth 492 > clientWidth 207`), switch button
opens the palette, and a full switch (search "outlook" -> select) navigates to
the target session and opens a second tab.

Regression: `packages/app/e2e/regression/mobile-composer.spec.ts` (zero overlap
among composer controls at 390px).
