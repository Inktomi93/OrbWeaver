---
kind: decision
status: open
updated: 2026-11-14
priority: P2
area: chat
---

# A floored fork whose floor is off a memory block edge carries strikes that match no block

## What

A fork counts its memory blocks from its first copied message. When a member's fork starts at a floor that is not on a block edge, every block shifts, so a strike carried from the parent room matches no summary in the fork and stays on the unmatched list. Whether struck text can then reach a fork prompt is not shown. Rule one of: carry only the strikes that land on the fork's grid, or re-key a carried strike onto each fork block it overlaps. The third fork case in tests/server/domain/chat/memory/memory-strikes-fork.int.test.ts builds no memory in the fork.

## Why

A host's strike is a promise that the scene stays out of prompts; a fork must keep it or say plainly that it did not.

## Done when

The ruling is recorded, the fork applies it, and a case builds the fork's memory after a floored fork and asserts the struck scene is absent from a forced-turn prompt.

## Evidence

Filled at landing: what ran and where its output is.
