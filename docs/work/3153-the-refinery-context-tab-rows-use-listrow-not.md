---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: client
plan: cross-surface-consistency
---

# The refinery context tab rows use ListRow, not a Card

## What

`RunRow`, `SetupRow` and the version rows in `LoadedVersions` of `packages/client/src/features/refinery/components/context-tabs.tsx` each draw a row as a `Card` holding a title line, chips and ghost actions. They are sites the cross-surface consistency plan lists for the list row, and no lane has moved them.

## Why

A row uses `ListRow` and a Card is for islands (`docs/plans/cross-surface-consistency/design.md`, Card sites), so these rows are the last ones still drawn as cards.

## Done when

Each of these rows is a `ListRow`, with chips as markers or detail and the buttons in `actions`. A CT over the refinery context tabs finds no `Card` row.

## Evidence

Filled at landing: what ran and where its output is.
