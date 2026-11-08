---
kind: bug
status: open
updated: 2026-11-08
priority: P2
area: client
plan: cross-surface-consistency
---

# A collection band keeps its primary create action visible when space runs out

## What

At 1280 with both panes docked, New folds into the band's More list actions menu on Chats, Characters, Presets and Databank, while the landing copy points at it. On a phone the Characters topbar cuts its name to Characte… because Import and New sit in the topbar, where Chats and Presets put them on a band row. Decide in the band owner that the name stays whole and the primary create stays inline (as an icon when narrow) while secondary actions fold first, and move Characters' phone actions to the band row. Update the CI case that asserts the fold.

## Why

The 2080 ruling keeps the name whole and folds actions first; folding the primary verb hides what a user does first on every collection.

## Done when

At 1280 with both panes docked every collection band shows its name whole and its primary create inline, the phone Characters title is whole at 320 to 430, and CTs assert both. Source: acceptance part 2 report L1 and L2.

## Evidence

Filled at landing: what ran and where its output is.
