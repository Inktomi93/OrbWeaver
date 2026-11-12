---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: ui
plan: surface-walk
---

# A stepped number field fits a column narrower than one touch target at enlarged text

## What

The stacked NumberField's minimum inline size makes the field wider than its column when the column is narrower than one touch target at enlarged text. Measurements are in the client leg review under reports/code-reviewer. No production form is known to give a stepped field so narrow a column.

## Why

A field wider than its column pushes its pane sideways.

## Done when

The narrowest column a stepped field gets is ruled in `docs/law/ui-package-design.md` and tested, or the field fits any column with its controls reachable.

## Evidence

Filled at landing: what ran and where its output is.
