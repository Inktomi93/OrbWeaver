---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
---

# A cluster's grouping-changed note pushes the member list down when it lands

## What

In the Corpus artifact surface the grouping check suspends behind a boundary with a null fallback and, when the stored grouping no longer matches the current one, paints a one-line status above the member list after the read settles. The list then moves down by that line.

## Why

Rows that move under the pointer after the surface reads as settled cause wrong presses. The unchanged-grouping case (the normal one) does not move; only the changed case does.

## Done when

A component test mounts a cluster whose grouping has changed, holds the archetypes read, and finds the first member row at the same position before and after the read lands, red before and green after.

## Evidence

Filled at landing: what ran and where its output is.
