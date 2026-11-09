---
kind: bug
status: doing
updated: 2026-11-09
priority: P2
area: client
lane: wt/agent-aeeecdd1ff632fbb2
plan: cross-surface-consistency
---

# Corpus catalog list collapses to zero height on a phone at enlarged text

## What

`packages/client/src/features/discovery/components/corpus-browse-view.tsx:193` wraps the `VirtualList` in a Stack with `minHeight="shrinks"`. On a phone at enlarged text the pane chrome takes the full height, and the list scroller reads zero height over its catalog. Shows at phone 200%, phone 300% text on: Rail independent corpus. The Distilled catalog renders no row with aria-setsize, so its pages never load.

## Why

A list that may shrink to zero shows no rows when the chrome above it fills the screen.

## Done when

The catalog list keeps at least one row's height, or the pane scrolls as a whole. These checkpoints show no enlarged-text geometry finding at 200% and 300% text: corpus-requested-pane-composition. The Distilled catalog renders and pages its rows at 200% and 300% on chromium-phone-portrait; Rail independent corpus passes its catalog step there.

## Evidence

Filled at landing: what ran and where its output is.
