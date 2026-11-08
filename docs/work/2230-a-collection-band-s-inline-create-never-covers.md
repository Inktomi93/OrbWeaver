---
kind: bug
status: doing
updated: 2026-11-08
priority: P2
area: client
lane: wt/agent-acaf86636920912a1
plan: cross-surface-consistency
---

# A collection band's inline create never covers its census

## What

At 1280 with both side panes open, the Characters band's New character button paints over the census, so the count reads as a shorter number. fitActions in packages/client/src/components/overflow-actions.tsx keeps the primary inline without reserving the census width. The design audit does not catch it.

## Why

A count that is partly covered reads as a wrong number.

## Done when

At 1280 with both panes docked no band action overlaps the title or census on any collection, with a CT that measures the census box against the action boxes. Source: acceptance part 3 report R2.

## Evidence

Filled at landing: what ran and where its output is.
