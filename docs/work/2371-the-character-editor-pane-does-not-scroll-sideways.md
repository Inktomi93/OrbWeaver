---
kind: bug
status: open
updated: 2026-11-09
priority: P2
area: client
plan: cross-surface-consistency
---

# The character editor pane does not scroll sideways at enlarged text

## What

On the phone the character editor pane scrolls sideways 72px at 200% text and 303px at 300%: the Tags row's Add tag button, the facet rows (a shrink-0 label beside an Empty word) and a kicker overshoot widen it. Ruling (claude-b under delegation): the facet row uses a wrapping inner row so its label and value stack when they do not fit.

## Why

A form that needs sideways scrolling fails reflow for an enlarged-text reader.

## Done when

The character editor pane has no sideways scroll at 200% and 300% on 320 and 390 phones, with a CT that fails on main.

## Evidence

Filled at landing: what ran and where its output is.
