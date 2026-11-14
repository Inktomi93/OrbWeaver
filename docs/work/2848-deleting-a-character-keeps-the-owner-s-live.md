---
kind: bug
status: open
updated: 2026-11-14
priority: P2
area: stats
---

# Deleting a character keeps the owner's live stats equal to a rebuild

## What

Deleting a character removes its seats, so a room it alone sat in leaves the set of chats the stats rebuild reads for the owner. The live owner totals keep counting that room and a rebuild drops it, so the shown chat count changes on Recompute. The other room counters and the spend for that room are likely to differ the same way. Deleting a room has the same gap from the other side: the delete verb in `packages/server/src/domain/chat/verbs/chat-lifecycle.ts` moves no live character count, so the count stays above a rebuild. Decide which side is right for a room with no seat left, then make both delete paths and `packages/server/src/domain/stats/persistence/rebuild-from-canon.ts` agree. Spend follows the owner ruling that money already paid is never lowered.

## Why

A total that changes when the reader presses Recompute cannot be trusted, and the law states the live path equals a rebuild over the same data.

## Done when

Server cases through the composed root delete the only character of a room, and delete a room whose characters sit nowhere else, and every owner total, the live character count and the spend are equal on the live path and after a rebuild.

## Evidence

Filled at landing: what ran and where its output is.
