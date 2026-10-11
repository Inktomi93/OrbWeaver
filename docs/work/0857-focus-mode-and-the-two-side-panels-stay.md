---
kind: bug
status: open
updated: 2026-10-11
priority: P2
area: client
---

# Focus mode and the two side panels stay in sync

## What

Owner report: entering focus mode breaks and loses sync with the two side panels, and the focus toggle's icon does not match the panels' actual state. Focus is resolved in packages/client/src/state/panel-resolve.ts (focus wins over everything) and set by setFocusMode in state/shell-store.ts; the toggle is a chrome entry (fullscreenChrome in compose/authed-app.tsx).

## Why

A toggle whose icon lies and panels that do not come back are disorienting.

## Done when

One source of truth: focus on hides both panels, focus off restores exactly the panels open before, opening a panel while in focus exits focus, and the toggle's icon and pressed state always reflect whether any side panel is showing; CTs cover enter, exit, open-a-panel-in-focus, both-panels and one-panel cases at desktop widths.

## Evidence

Filled at landing: what ran and where its output is.
