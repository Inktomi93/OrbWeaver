---
kind: bug
status: doing
updated: 2026-11-09
priority: P2
area: ui
lane: wt/agent-a88fe4fa1ec4fa014
plan: cross-surface-consistency
---

# EmptyState action labels wrap between words

## What

At 320 and 300% text the EmptyState actions stay inside the pane but break inside words (Ne/w/ch/at, Open/Plugi/ns, New/sche/dule): the Button wrap styling uses overflow-wrap anywhere, the landing keeps wide side padding and the button its own.

## Why

A label broken mid-word reads as garbage.

## Done when

Wrapped action labels break only between words at 320 and 300% text, with a CT asserting no mid-word break, and longer words step down instead of splitting.

## Evidence

Filled at landing: what ran and where its output is.
