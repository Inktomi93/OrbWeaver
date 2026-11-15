---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: client
plan: cross-surface-consistency
---

# Keep a pack row's uncommitted edit when the row is shut

## What

`PackListRow` in `packages/client/src/features/rpg/components/rpg-pack-rows.tsx` opens `PackTileEditor` in a ListRow panel that unmounts when shut, so a click-to-edit field's uncommitted draft is dropped; the grid tile's popover drops it the same way. Before the move the list row's fields were always mounted.

## Why

A host who folds the row mid-edit loses what they typed.

## Done when

The panel keeps the editor mounted while shut (a `keepMounted` branch on the ListRow expand) or the field commits on close, with a CT that types, shuts, reopens and finds the draft.

## Evidence

Filled at landing: what ran and where its output is.
