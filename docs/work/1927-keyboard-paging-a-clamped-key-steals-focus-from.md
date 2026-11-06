---
kind: bug
status: open
updated: 2026-11-06
priority: P2
area: ui
plan: cross-surface-consistency
---

# Keyboard paging: a clamped key steals focus from Earlier on the next press

## What

After a key that moves nowhere (Home on the first row, End on the last), pressing Earlier moves focus into a row. row-roving.ts sets a pending focus index that only a commit consumes, so the press's commit takes it. ArrowDown into a row taller than the viewport also lands at its end, from align auto in the walk's scrollToIndex.

## Why

A keyboard reader's paging stops silently with Earlier far off screen, and a tall message's start is skipped.

## Done when

Focus stays on Earlier after a clamped key, and a walk into a tall row lands at its start, each with a real-key test.

## Evidence

Filled at landing: what ran and where its output is.
