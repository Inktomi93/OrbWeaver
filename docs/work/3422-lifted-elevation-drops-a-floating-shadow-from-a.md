---
kind: bug
status: open
updated: 2026-11-15
priority: P1
area: client
plan: cross-surface-consistency
---

# Lifted elevation drops a floating shadow from a docked panel onto the phone bar

## What

Under the `glow` elevation setting, `packages/client/src/features/app-shell/surfaces/shell/grid.css` gives every `.shell-panel` the `--shadow-overlay` recipe in any panel mode. On a phone the list that is the screen is a docked panel pinned above the bar at a higher layer, and `mobile.css` never resets the shadow, so its drop paints over the bar and its upper layers over the topbar.

## Why

A docked surface reads as floating above the navigation, and the seam appears on some tabs and not on others. The owner reported it from his phone.

## Done when

A docked surface casts no overlay shadow under any elevation setting, stated once where elevation is assigned. Before and after screenshots at a phone size show the bar's seam the same on every tab. The other elevation settings render as before.

## Evidence

Filled at landing: what ran and where its output is.
