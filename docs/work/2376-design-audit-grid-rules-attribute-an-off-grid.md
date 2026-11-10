---
kind: tooling
status: doing
updated: 2026-11-10
priority: P3
area: tooling
lane: wt/agent-a461ab89d9d634803
plan: cross-surface-consistency
---

# Design-audit grid rules attribute an off-grid landing to the layer that creates it

## What

off-grid-transform fires on every switch thumb whose own translate is a whole 16px because its pane origin is fractional, and off-grid-text fires on text inside a backdrop-filter layer that promoted-layer-offset already files. The walker parses the matrix translation (census-grid.ts) but does not pass it to the check.

## Why

Hundreds of findings on descendants bury the one layer that owns the fraction.

## Done when

A unity-scale subject whose own translation is on the grid is excluded as inheriting its ancestor's landing and counted in the accounting; text under a layer that promoted-layer-offset files collapses into that row; an authored fractional translate still fires, with fixtures.

## Evidence

Filled at landing: what ran and where its output is.
