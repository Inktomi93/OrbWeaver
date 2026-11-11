---
kind: bug
status: open
updated: 2026-11-11
priority: P3
area: client
plan: surface-walk
---

# The render hint picker lays Insert render hint over its role picker at enlarged text

## What

`packages/client/src/features/refinery/components/render-hint-picker.tsx` keeps both on one row that never wraps (kind K27). Evidence: the enlarged-text verdict table under reports/cb-walk-text.

## Why

Overlapping controls take each other's presses.

## Done when

The row wraps, a component test shows no overlap, and the walk lists none.

## Evidence

Filled at landing: what ran and where its output is.
