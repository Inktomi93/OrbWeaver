---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: client
plan: surface-walk
---

# The regex tier row's switch and menu cluster ends past the row at the largest phone text

## What

On the narrowest phone width at the largest browser text, a regex tier row's actions cluster, the switch and the More menu, ends past the row. The subtitle's stage glyph boxes also end past it and are clipped by the subtitle's truncation. Measurements are in the row title lane report under reports/lanes.

## Why

A control that ends past its row at the largest text can be cut or unreachable on the narrowest phone.

## Done when

A component test at the narrowest phone width and the largest text shows the cluster inside its row and every control reachable, red on the current row, with the normal-size row unchanged.

## Evidence

Filled at landing: what ran and where its output is.
