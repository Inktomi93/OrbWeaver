---
kind: bug
status: open
updated: 2026-11-11
priority: P3
area: client
plan: surface-walk
---

# The selection bar collapses below one line at enlarged text

## What

`packages/ui/src/primitives/selection-bar/selection-bar.tsx` caps the bar's block size; on trust actions the bar is shorter than its content (kind K25). Evidence: the enlarged-text verdict table under reports/cb-walk-text.

## Why

Touch cannot reach what a collapsed scroller holds.

## Done when

The bar holds at least one line at both sizes in a component test, and the walk lists no collapsed selection bar.

## Evidence

Filled at landing: what ran and where its output is.
