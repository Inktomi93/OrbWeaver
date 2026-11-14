---
kind: bug
status: open
updated: 2026-11-14
priority: P1
area: client
plan: cross-surface-consistency
---

# A short list pane scrolls as a whole, so a page under the Corpus mode switch keeps its rows

## What

In a list pane 20rem tall or less at the enlarged root the shell made the LIST page root the scroller. The Corpus list column puts its mode switch above the page, outside that scroller, so at 300% text on a phone the switch grew to about 560 px, the page under it shrank to no height, and its target select, search and first catalog row sat under the switch and the tab bar. The rule in packages/client/src/features/app-shell/surfaces/shell/panels.css now lets the page flow at its content height and the pane body scroll the whole pane, with the rows' floor unchanged.

## Why

ui-platform-rulings §8.1 says such a pane scrolls as a whole and its rows keep a floor; the old rule met it only when the page was the pane body's only child.

## Done when

corpus-finder-reach, corpus-results-text-scale and the Corpus catalog case of platform-enlarged-reach pass at 300% text on a phone, red on the old rule, and the other list-pane suites stay green.

## Evidence

Filled at landing: what ran and where its output is.
