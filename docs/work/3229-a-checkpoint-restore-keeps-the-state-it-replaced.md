---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: rpg
---

# A checkpoint restore keeps the state it replaced

## What

A restore clones a bookmark forward, so the prior head is unreachable unless the host saved it first, and a checkpoint holds the snapshot only. Save the replaced head as a bookmark before a restore, and have the dialog say what a checkpoint holds.

## Why

A restore is destructive without warning when the head was never bookmarked.

## Done when

A test restores a checkpoint and finds the replaced head restorable, and the dialog states what a checkpoint holds.

## Evidence

Filled at landing: what ran and where its output is.
