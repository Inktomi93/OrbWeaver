---
kind: bug
status: open
updated: 2026-11-14
priority: P2
area: stats
---

# Deleting a character keeps the owner's live stats equal to a rebuild

## What

Deleting a character removes its seats, so a room it alone sat in leaves the set of chats the stats rebuild reads for the owner. The live owner totals keep counting that room and a rebuild drops it, so the shown chat count changes on Recompute. The other room counters and the spend for that room are likely to differ the same way. Decide which side is right for a room with no seat left, then make the delete path and `packages/server/src/domain/stats/persistence/rebuild-from-canon.ts` agree. Spend follows the owner ruling that money already paid is never lowered.

## Why

A total that changes when the reader presses Recompute cannot be trusted, and the law states the live path equals a rebuild over the same data.

## Done when

A server case through the composed root deletes the only character of a room, and every owner total and the spend are equal on the live path and after a rebuild.

## Evidence

Filled at landing: what ran and where its output is.
