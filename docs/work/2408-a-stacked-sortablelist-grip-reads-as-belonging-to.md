---
kind: bug
status: open
updated: 2026-11-10
priority: P2
area: ui
plan: cross-surface-consistency
---

# A stacked SortableList grip reads as belonging to its own row

## What

Below the SortableList container step the grip stacks above its row. The stacked pair now sits 4px apart with 16px above it (merged at bcf2af03ad, CT strict), but whether a sighted user can tell which row a grip moves in sampler order and the prompt rack has had no rendered judgment since the change.

## Why

A drag handle that is not visibly attached to its row invites moving the wrong item.

## Done when

The stacked grip groups visually with its own row (spacing, alignment or a shared surface from the row's own tokens) in every SortableList consumer, judged by a rendered review of sampler order and the prompt rack at 200% phone, with a CT asserting the grip's gap to its row is smaller than its gap to the row above.

## Evidence

Filled at landing: what ran and where its output is.
