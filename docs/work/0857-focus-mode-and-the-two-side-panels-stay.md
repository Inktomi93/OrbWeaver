---
kind: bug
status: doing
updated: 2026-10-11
priority: P2
area: client
lane: wt/agent-adc51f781af4ecfb9
---

# Focus mode is removed

## What

Owner report: entering focus mode breaks and loses sync with the two side panels, and the focus toggle's icon does not match the panels' actual state. Focus is resolved in packages/client/src/state/panel-resolve.ts (focus wins over everything) and set by setFocusMode in state/shell-store.ts; the toggle is a chrome entry (fullscreenChrome in compose/authed-app.tsx).

## Why

A toggle whose icon lies and panels that do not come back are disorienting.

## Done when

Focus mode and its toggle are removed (store state, panel resolution, chrome entry, agent-nav verbs, tests and docs); the per-panel toggles are the only panel controls and the narrow-desktop auto-collapse still works.

## Evidence

Filled at landing: what ran and where its output is.

Owner ruling: focus mode is not needed; remove it rather than fix its sync.
