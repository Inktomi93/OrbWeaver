---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: rpg
---

# The tracker ceiling comment names only real consumers

## What

The comment on `trackerCeiling` in `packages/contracts/src/rpg/tracker.ts` lists a delta clamp among the readers of the ceiling; the delta text only prints the ceiling and the write path clamps nothing. Correct the comment to the readers a reference search finds.

## Why

A wrong comment sends the next author hunting for a clamp that does not exist.

## Done when

The comment names only readers that call the resolver.

## Evidence

Filled at landing: what ran and where its output is.
