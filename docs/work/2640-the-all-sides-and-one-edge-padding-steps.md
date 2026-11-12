---
kind: work
status: open
updated: 2026-11-12
priority: P3
area: ui
plan: cross-surface-consistency
---

# The all-sides and one-edge padding steps hold against the viewport at enlarged text

## What

The inline padding prop at the block and section steps now writes held tokens, so page and panel insets stop growing with text on a phone. The all-sides padding prop and the start and end padding props at the same steps still grow with text, so a box that uses them disagrees with a sibling that uses the inline prop. Site lists are in the insets lane report under reports/lanes.

## Why

Two props for the same inset give different widths at enlarged text.

## Done when

Those props write the held tokens on their inline sides, default text is unchanged by a computed-style comparison on the surfaces that use them, and each reader's bleed still lands on its parent's edge.

## Evidence

Filled at landing: what ran and where its output is.
