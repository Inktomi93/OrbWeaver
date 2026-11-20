---
kind: bug
status: doing
updated: 2026-11-20
priority: P2
area: ui
lane: wt/agent-a973d60a65e7ade06
plan: cross-surface-consistency
---

# An equal-cell toggle group whose cells cannot hold their labels stacks one letter per line

## What

The fill variant of ToggleGroup (packages/ui/src/primitives/toggle-group/variants.ts) breaks a one-word label anywhere inside its share of the strip. At 300% text on a 390 px phone the Corpus mode switch (Explore, Insights, Tags) renders each label one letter per line and grows to about 560 px tall. The same variant serves the Insights sort strip, the image options and the invite dialog. A likely answer is that a group whose cells cannot hold their labels stacks its options one per row; that changes the UI-Density-Law Toggle row, so it needs a ruling.

## Why

A label read one letter at a time is unreadable, and the strip takes most of a short pane's height before anything the reader came for.

## Done when

The owner rules the behaviour; the variant and the law row change together, and a reflow case at every platform text size on a phone shows each label on whole words inside its cell.

## Evidence

Filled at landing: what ran and where its output is.
