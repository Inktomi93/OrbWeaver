---
kind: bug
status: open
updated: 2026-11-20
priority: P1
area: rpg
---

# A quest action that names no known quest mints a quest only on create

## What

`applyUpsertQuest` in `packages/server/src/domain/rpg/tools/apply.ts` finds a quest by exact name and, when none matches, mints a new quest with the status the action implies, for every action. A complete or fail with a misspelled name therefore creates a finished quest that never existed and leaves the real one active. Make complete, fail and update on an unknown name a refused call that is dropped and recorded, let only create mint, and decide whether name matching folds case and surrounding whitespace and say so in the tool description.

## Why

A small model misspells a quest name routinely; the result is a phantom finished quest in the player's journal and an unfinished real quest.

## Done when

A test sends complete, fail and update for an unknown name through the state round and finds no new quest and a recorded refusal; a create still mints; the tool description states the matching rule.

## Evidence

Filled at landing: what ran and where its output is.
