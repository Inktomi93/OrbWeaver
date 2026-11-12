---
kind: bug
status: open
updated: 2026-11-12
priority: P3
area: ui
plan: surface-walk
---

# An inline hint trigger keeps its whole press target inside a clipping panel

## What

The inline HintTrigger bleeds its box past its row with a negative margin (packages/ui/src/primitives/hint-trigger/variants.ts). When that row is the first row of a box that clips, the box cuts the top of the trigger. The preset editor's Advanced panel is such a box (packages/ui/src/primitives/collapsible/variants.ts), and it opens with the Word bias legend. The cut shows at standard text and grows at enlarged text. Evidence and a reproducing component test are named in the drafted items page under reports/cb-walk-text.

## Why

A cut box is a smaller press target than the trigger promises, and the walk reports it on every checkpoint that shows the open panel.

## Done when

No inline hint trigger's box crosses the edge of a clipping ancestor. A component test over the open Advanced panel at standard and enlarged text shows the Word bias trigger inside the panel, and the walk lists no finding for it.

## Evidence

Filled at landing: what ran and where its output is.
