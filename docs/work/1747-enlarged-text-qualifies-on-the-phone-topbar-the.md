---
kind: bug
status: open
updated: 2026-11-01
priority: P1
area: client
plan: css-system
---

# Enlarged text qualifies on the phone topbar, the panels, the phone room and every 300% layout case, on Chromium and WebKit

## What

Qualify the shell's list and Context panels, the topbar, the room and the Import dialog at 200% text and 300% layout, on the phone and the desktop, on Chromium and WebKit, and repair each failure at its shared owner.

## Why

Item 1299 landed with these cases open. At 300% on a phone the list lost its rows, the transcript collapsed to one line, the Context header overlaid its own controls and menus ran off the screen. Comparative acceptance waits on this.

## Done when

`tests/client/features/app-shell/surfaces/platform-text-scale.suite.ct.tsx` runs every surface at every cell of its matrix on both browsers, with old-source failures shown. A rendered reviewer accepts the wrapped states. Real-device behaviour stays a device check.

## Evidence

Filled at landing: what ran and where its output is.
