---
kind: work
status: doing
updated: 2026-11-07
priority: P2
area: ui
lane: wt/agent-a4e0062138fd4114a
plan: cross-surface-consistency
---

# Width caps on layout boxes come from one axis

## What

Add a cap axis to Stack, Row and Grid with fit, reading and column variants plus named singles, and move the hand-written max-inline classes onto it. Give grid, tabs, command and container the missing axes for their items, padding and block-full classes.

## Why

Width caps are one design idea written by hand across the client, so the census reports them as moves with no owner.

## Done when

The census reports no max-inline class on a layout box, and the feature className rule refuses one.

## Evidence

Filled at landing: what ran and where its output is.
