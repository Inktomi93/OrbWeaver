---
kind: bug
status: open
updated: 2026-10-31
priority: P3
area: rpg
---

# Deleting a message that anchors RPG rows surfaces a raw foreign-key error

## What

During review, chat.deleteMessages on an assistant message that anchors rpg snapshot or journal rows surfaced as a raw TRPCError SQLITE_CONSTRAINT (FOREIGN KEY constraint failed, a trigger) instead of a typed refusal. Not yet investigated.

## Why

A raw database error reaching the client is neither a typed refusal the UI can explain nor a guaranteed safe outcome.

## Done when

The delete either succeeds with the anchored rows handled by rule, or refuses with a typed domain error the client explains, pinned by a server integration test through the composed root.

## Evidence

The refusal is `rpg_checkpoints.snapshot_id` RESTRICT (`packages/db/src/schema/rpg.ts`): deleting a message cascades its turn snapshot, and a checkpoint pinning that turn row blocks it (SQLITE_CONSTRAINT_TRIGGER). Live checkpoints never pin a turn row (`create-checkpoint.ts` detaches to a hand clone), but the import arm inserted a file's checkpoint on whatever snapshot it named. `portability-write.ts` now pins a hand clone stamped at the turn when the named snapshot is a turn row, the same detach rule a live checkpoint follows. Pinned by `tests/server/domain/import/loader/library-planes.int.test.ts` (import a campaign bundle, `chat.deleteMessages` on the anchoring turn, the checkpoint then restores its saved state; red as the raw FOREIGN KEY failure).
