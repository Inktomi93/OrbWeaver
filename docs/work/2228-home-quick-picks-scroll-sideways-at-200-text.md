---
kind: bug
status: doing
updated: 2026-11-09
priority: P3
area: client
lane: wt/agent-a2c682ad8003e0eaf
plan: cross-surface-consistency
---

# Home quick picks scroll sideways at 200% text

## What

On the enlarged-text Home walks at phone 200% and 300% and desktop 200%, the quick-picks grid scrolls sideways instead of reflowing. The grid is the cellSwipe variant at packages/ui/src/layout/variants.ts:692, a snap strip with overflow-x-auto by design. It carries no role or attribute the geometry probe reads, so a designed strip and a column that stopped reflowing look the same.

## Why

Content that needs sideways scrolling at 200% text fails the reflow expectation for enlarged text.

## Done when

A ruling on whether the grid is a declared sideways strip, then either the grid reflows at 200% and 300% text with no horizontal scroll, or the strip declares itself through an attribute the probe reads. Either way the home-requested-pane-composition, home-tile and home-whole checkpoints show no enlarged-text geometry finding at 200% and 300%.

## Evidence

Filled at landing: what ran and where its output is.
