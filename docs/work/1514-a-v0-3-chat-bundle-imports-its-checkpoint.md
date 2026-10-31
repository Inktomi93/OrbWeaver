---
kind: bug
status: open
updated: 2026-10-31
priority: P3
area: rpg
---

# A v0.3 chat bundle imports its checkpoint copy as a state step

## What

Bundles written by v0.3.0 and v0.3.1 carry a checkpoint's saved copy as an ordinary hand snapshot, because the bookmark flag did not exist. On import, createImportRpgGame inserts it as a beat, so a restored room keeps the stale state over a later swipe until the next swipe or turn. Migration 0006 already recognises the same shape in place: a hand row pinned by a checkpoint with the same created_at.

## Why

Item 1492 fixed the in-place rooms and new bundles; an old bundle still restores the bug.

## Done when

The import skips a carried hand snapshot whose createdAt equals the createdAt of a checkpoint that points at it, writing the checkpoint's bookmark from it instead; a library-planes case imports a v0.3-shape bundle, swipes, and shows the swiped state, red first.

## Evidence

Filled at landing: what ran and where its output is.
