---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: client
plan: cross-surface-consistency
---

# Let the pack list row show a long item name whole

## What

`PackListRow` in `packages/client/src/features/rpg/components/rpg-pack-rows.tsx` passes the model-written `item.name` as the ListRow `title`, which truncates; the file header calls the list row the item read in full, and `packages/client/src/features/rpg/components/rpg-pack-fields.tsx` says a model-written name wraps.

## Why

A long item name is cut in the view meant to read it whole.

## Done when

The list row's name wraps (a wrapping title branch on ListRow), or the header and the field rule are amended with a reason.

## Evidence

Filled at landing: what ran and where its output is.
