---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: rpg
---

# The rpg sheet patch derives from the sheet it writes against

## What

`packages/server/src/domain/rpg/verbs/patch-sheet.ts` reads the current sheet, merges the patch and upserts outside any per-game write chain. Another writer of the same sheet, such as the born-state fill from a card, can land between the read and the upsert and be overwritten by the merge. Confirm whether a second writer can reach the same sheet in practice and, if so, serialise the read-modify-write.

## Why

The quest delete showed the same read-then-write shape losing a concurrent write; the sheet plane is the sibling that has not been read for it.

## Done when

A test interleaves the born-state fill with a sheet patch and both fields hold, or the item is closed with the trace that shows no second writer can reach a sheet.

## Evidence

Filled at landing: what ran and where its output is.
