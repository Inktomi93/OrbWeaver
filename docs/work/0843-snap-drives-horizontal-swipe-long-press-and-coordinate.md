---
kind: tooling
status: open
updated: 2026-10-11
priority: P3
area: tooling
---

# Snap drives horizontal swipe, long-press and coordinate taps

## What

\--swipe takes only a vertical selector=dy; there is no long-press and no tap by coordinate (tooling/src/snap/ops/drive-actions.ts).

## Why

Phone reviews cannot drive swipe gestures or long-press menus (see item 838).

## Done when

Snap verbs for horizontal swipe, long-press and coordinate tap, each needing a touch context, with a test and help text.

## Evidence

Filled at landing: what ran and where its output is.
