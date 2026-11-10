---
kind: bug
status: doing
updated: 2026-11-10
priority: P2
area: ui
lane: wt/agent-a25c03bac14ebf059
plan: cross-surface-consistency
---

# A stacked SortableList grip reads as belonging to its own row

## What

Below the list's container step the SortableList grip stacks on its own line, but in sampler order and the prompt rack it sits as close to the row above as to its own and inset from the label edge, so a sighted user cannot tell which grip moves which row. The rule list reads fine.

## Why

A drag handle that is not visibly attached to its row invites moving the wrong item.

## Done when

The stacked grip groups visually with its own row (spacing, alignment or a shared surface from the row's own tokens) in every SortableList consumer, judged by a rendered review of sampler order and the prompt rack at 200% phone, with a CT asserting the grip's gap to its row is smaller than its gap to the row above.

## Evidence

Filled at landing: what ran and where its output is.
