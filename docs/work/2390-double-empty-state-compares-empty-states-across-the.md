---
kind: tooling
status: open
updated: 2026-11-10
priority: P3
area: tooling
plan: cross-surface-consistency
---

# double-empty-state compares empty states across the panes of one screen

## What

The double-empty-state walker groups empty-state roots by their nearest landmark, and every shell pane is its own landmark, so two empty states shown side by side in the content and context panes never meet. The crowded half of the rule cannot fire across panes.

## Why

Two empty states on one screen tell the user the same nothing twice; the rule exists to catch that and is blind to the common shell case.

## Done when

The rule groups empty states per visible screen as well as per landmark, a fixture with one empty state in each of two panes fires, and a control with one pane empty stays silent; the population accounting shows the new grouping.

## Evidence

Filled at landing: what ran and where its output is.
