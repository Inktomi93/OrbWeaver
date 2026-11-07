---
kind: tooling
status: open
updated: 2026-11-07
priority: P2
area: ui
plan: cross-surface-consistency
---

# Census and migrate-owner answer for Button's scale props and partly worn variants

## What

Make Button answer for size, square and wrap, which reach ButtonCore through scale. Make migrate-owner plan a whole variant on a Button and apply it instead of failing the state limit in recipe-check. Report a class set that wears part of a multi-class variant, a lone max-inline on a layout box, a mirror spelling such as flex-col @cq-32:flex-row, and the repeated justify-start pattern on Button. Correct the axis the census names for a Swatch size class.

## Why

The focused review of the census found classes that pass lint and show no census row, so the all-clean census overstates what it can see, and every Button move is a hand move today.

## Done when

Planted size, square and wrap classes on a Button fail lint and show in the census, migrate-owner applies a Button move, and a partly worn variant shows as a census row.

## Evidence

Filled at landing: what ran and where its output is.
