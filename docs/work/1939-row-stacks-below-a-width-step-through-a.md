---
kind: work
status: open
updated: 2026-11-06
priority: P2
area: ui
plan: cross-surface-consistency
---

# Row stacks below a width step through a prop

## What

Add a Row prop that stacks the row below a container width step, covering the hand-written max-cq flex-col, items-stretch and justify-end classes, and migrate the sites.

## Why

Stacking at narrow widths is one design idea written by hand in each file.

## Done when

No feature writes a max-cq flex-col class on a Row, and the prop uses the existing width steps.

## Evidence

Filled at landing: what ran and where its output is.
