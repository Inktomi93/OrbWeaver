---
kind: bug
status: open
updated: 2026-11-15
priority: P2
area: rpg
---

# Deleting a quest derives its next state inside the hand-write resolve

## What

`packages/server/src/domain/rpg/verbs/quest/delete-quest.ts` reads the head state, filters the quest list, then hands the whole list to the hand-edit image door, so the removal carries a quest list read before the write's own head resolve. Make the delete an op-shaped write that derives its next list from the head inside the read-modify-write door in `packages/server/src/domain/rpg/snapshot-edit.ts`, releasing the removed quest's lock in the same derive, as the quest upsert and objective edit already do.

## Why

A model flush that lands between the read and the write has its quest changes overwritten by the stale list; the rpg law says an op-shaped write never builds its image outside the head resolve.

## Done when

A server test interleaves a state-round flush that adds or changes a quest with a delete of another quest through the real verb, and both the flush's quest change and the delete hold in the resolved head.

## Evidence

Filled at landing: what ran and where its output is.
