---
kind: work
status: doing
updated: 2026-11-07
priority: P2
area: ui
lane: wt/agent-a4e0062138fd4114a
plan: cross-surface-consistency
---

# Corner placement has one owner

## What

Give the corner badge shape, absolute inset-bs-field inset-e-field, one placement primitive or layout prop and move every site on it, across the five primitives that hand-write it.

## Why

The same placement is repeated by hand on different primitives, so changing the inset misses sites.

## Done when

No site writes that class pair, and the census reports no corner cluster.

## Evidence

Filled at landing: what ran and where its output is.
