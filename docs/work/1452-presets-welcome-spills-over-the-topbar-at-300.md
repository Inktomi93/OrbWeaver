---
kind: bug
status: open
updated: 2026-10-30
priority: P2
area: ui
---

# Presets welcome spills over the topbar at 300% text

## What

At 300% text the Presets welcome pane spills upward over the topbar.

## Why

Pre-existing; side-eye found it in the shell overflow review (`reports/side-eye/2026-10-30-shell-overflow.md`). Item 1299 requires panels and content to stay usable at enlarged text.

## Done when

At 300% text on desktop and phone, the Presets welcome stays inside the content pane and every control is hit-testable, pinned as a `QUALIFIED` case in `tests/client/features/app-shell/surfaces/platform-text-scale.suite.ct.tsx` on Chromium and WebKit.

## Evidence

Filled at landing: what ran and where its output is.
