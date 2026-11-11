---
kind: bug
status: open
updated: 2026-11-11
priority: P3
area: client
plan: surface-walk
---

# The logit bias row lays its Add button over the Bias field at enlarged text

## What

`packages/client/src/features/preset/components/logit-bias-editor.tsx` keeps the field and Add on one row that never wraps; at the largest phone text they overlap (kind K24). Evidence: the enlarged-text verdict table under reports/cb-walk-text.

## Why

Overlapping controls take each other's presses.

## Done when

The row wraps, a component test shows no overlap, and the walk lists none.

## Evidence

Filled at landing: what ran and where its output is.
