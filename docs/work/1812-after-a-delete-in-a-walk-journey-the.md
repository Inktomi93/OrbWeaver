---
kind: work
status: open
updated: 2026-11-27
priority: P3
area: testing
plan: surface-walk
---

# After a delete in a walk journey, the walker asserts focus is not on body and no read of the deleted id follows

## What

After a delete in a walk journey, make the walker assert that focus is not on the page body and that no read of the deleted id follows.

## Why

A delete that leaves focus on the page body strands keyboard users, and a read of the deleted id returns 404 (the deleted-preset `preset.get` case). `walkDoor` in tests/e2e/support/surface-walker.ts asserts focus returns to the opening door only; no walk step checks focus after a delete or watches reads of a deleted id.

## Done when

The walker fails a journey that leaves focus on the body or reads the deleted id after a delete. A planted control journey that does both fails the check.

## Evidence

`surfaceAction` in `tests/support/browser/surface-action.ts` takes `deleted`; the action fails when focus stays on the body or a tRPC query carries the deleted id after a mutation response (`tests/support/browser/delete-aftermath.ts`). Journey deletes in `tests/e2e/support/surface-character.ts`, `surface-sections.ts` and `surface-chat.ts` declare it. Planted controls in `tests/support/browser/surface-measurement.ct.tsx` fail on a body-focus delete and on a read of the deleted id, and pass a delete that returns focus. The live e2e journeys are not run in this lane; the orchestrator owns that run.
