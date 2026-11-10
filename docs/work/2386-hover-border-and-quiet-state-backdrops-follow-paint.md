---
kind: bug
status: open
updated: 2026-11-10
priority: P3
area: tooling
plan: cross-surface-consistency
---

# Hover, border and quiet-state backdrops follow paint order and scroller clips

## What

The design-audit walker's non-text backdrop callers still judge layers by tree order alone, compare unclipped layer rects, and stop at the first background-image. The text path gained stacking-aware, clipped answers in tooling/src/ui-audit/ops/walker/resolve.ts; the hover, border and quiet-state callers did not.

## Why

The same false layers that held text-over-art can hold these rules at withheld or produce findings no user sees.

## Done when

The hover, border and quiet-state callers use the stacking-aware and clipped backdrop answers, each change has a red-first fixture and a control that still fires, and their population counts are compared before and after on one evidence run.

## Evidence

Filled at landing: what ran and where its output is.
