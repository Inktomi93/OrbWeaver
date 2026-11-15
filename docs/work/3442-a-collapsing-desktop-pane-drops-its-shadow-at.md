---
kind: bug
status: open
updated: 2026-11-15
priority: P1
area: client
plan: cross-surface-consistency
---

# A collapsing desktop pane drops its shadow at the start of its slide

## What

The glow rule in `packages/client/src/features/app-shell/surfaces/shell/grid.css` excludes `[data-panel-mode="collapsed"]`. The mode flips when the collapse starts, so the shadow goes at the first frame while the pane is still sliding.

## Why

The pane's edge changes abruptly before its motion ends.

## Done when

The shadow leaves with the pane, by fading or by holding until the slide ends, under the rule the surface law gives for a surface in motion. A motion run of the collapse shows no abrupt shadow change.

## Evidence

Filled at landing: what ran and where its output is.
