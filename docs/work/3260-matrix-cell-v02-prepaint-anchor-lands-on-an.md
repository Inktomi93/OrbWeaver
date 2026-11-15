---
kind: bug
status: open
updated: 2026-11-15
priority: P2
area: snap
---

# Matrix cell v02 prepaint anchor lands on an off-screen list panel header

## What

In cell v02-e94dae4ee334, the row opposite-os-app-prepaint cannot hold its theme-ink anchor. The cell runs on desktop 1280x800, light OS, reduced motion, a rated custom theme, fontScale 1.25 and bubble. The anchor matched the list panel header at rect left -340, width 340, top 0, height 60. The anchor in tooling/src/snap/ops/appearance-surface-drive.ts takes the first candidate with a box, in document order, even when no scroll can bring it into view. Not classified: either the list panel is collapsed or off-canvas in that cell's layout (fontScale 1.25 may flip the shell container to its narrow branch), or the anchor or THEME_INK selector in packages/client/src/lib/appearance-invariant-manifest.ts is wrong for desktop.

## Why

The cell has no verdict, and a prepaint check must anchor on ink the cell's layout actually shows.

## Done when

A drive of that cell names the shell state (docked or drawer) and which theme-ink candidate is visible. The anchor picks a candidate the layout shows, or the selector is corrected, with a test at the tool's door.

## Evidence

Filled at landing: what ran and where its output is.
