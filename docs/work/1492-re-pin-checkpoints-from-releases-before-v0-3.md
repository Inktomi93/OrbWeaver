---
kind: bug
status: open
updated: 2026-10-31
priority: P2
area: rpg
---

# Re-pin checkpoints from releases before v0.3.0 that bookmark a turn snapshot

## What

Releases v0.1.0 to v0.2.0 shipped a createCheckpoint that set snapshotId to the head turn row directly; the detach rule arrived in v0.3.0, and no shipped migration touches checkpoints. In a room created on those releases, deleting the turn's message fails with a raw SQLITE_CONSTRAINT foreign-key error. Fork (rpg/chat-ops/fork-game.ts) copies such a checkpoint into a new room. The import path is fixed (item 1487); rooms created in place are not.

## Why

Public users on those releases who made checkpoints cannot delete those turns, and the client shows a raw database error.

## Done when

A numbered migration copies each checkpoint target into a committed bookmark row and re-points the checkpoint. A bookmark is not a beat: the state ladder never reads it. The same migration makes a checkpoint on a beat unrepresentable: the checkpoint carries a snapshot kind fixed to bookmark and a composite foreign key to the snapshot's id and kind, so an insert that pins a turn or hand row fails. Confirm the schema and the old release code before writing it. A migration integration test deletes the turn on a migrated legacy shape and the checkpoint still restores.

## Evidence

Confirmed first: `git show v0.2.0:packages/server/src/domain/rpg/verbs/checkpoint/create-checkpoint.ts` inserts `snapshotId: head.id` from `resolveSnapshotForTurn`, whose head can be a turn row; the detach rule arrived in `fa0badf99b`, which only v0.3.0 and v0.3.1 contain; no migration after `0000_baseline` names `rpg_checkpoints`.

Migration `packages/db/src/migrations/0006_bookmark-checkpoint-snapshots.sql` rebuilds `rpg_snapshots` with a stored `kind` (`turn`, `hand`, `bookmark`), a kind CHECK and a unique `(id, kind)` index. It rebuilds `rpg_checkpoints` with `snapshot_kind` (default and CHECK `bookmark`) and a composite RESTRICT foreign key to `(id, kind)`. It recognises a v0.3.x checkpoint copy as a hand row pinned by a checkpoint with the same `created_at`, because `git show v0.3.1:packages/server/src/domain/rpg/verbs/checkpoint/create-checkpoint.ts` wrote the copy and the checkpoint from one `now`. It turns each copy into the bookmark and clears its as-of stamp. Every other checkpoint gets a committed bookmark copy of its target with the checkpoint's `created_at`, id `rpg_snapshot_` plus the checkpoint's TypeID suffix, and is re-pointed. The other pinned turn and hand rows stay as the beats they were.

The ruling is in D124 (`docs/adr/0124-hand-written-rpg-state-stays-off-messages.md`). The state ladder in `packages/server/src/domain/rpg/persistence/snapshots.ts` reads hand rows by kind, so it never reads a bookmark. The live `createCheckpoint`, the import, the fork and the migration all write the bookmark copy. Restore reads it by id and writes a hand beat. The partial `rpg_snapshots_variant_unique` index stays keyed on `variant_id is not null`, because the swipe lookups and the turn walk's join use it only under that predicate.

Pinned by:

- `tests/server/entry/boot/persistence/checkpoint-repin.int.test.ts`. It plants pre-0006 checkpoints on the chain cut before 0006 (`plantLegacyCheckpoint`, a sanctioned historic state). After the migration, a later turn stays current, `chat.deleteMessages` removes the bookmarked turn, and restore brings back the saved location. A pin on a swiped-away variant leaves the selected swipe's state current, and is red on the hand-copy repair. A v0.3.x copy at the tail becomes the bookmark, so the later swipe shows and restore brings the copy's state back; red before the copy rule. A pinned hand edit made before its checkpoint stays the room's state and gets its own bookmark.
- `tests/server/domain/rpg/persistence/immutable-bookmarks.suite.int.test.ts`. A checkpoint on the tail turn leaves the state after a swipe and after the next turn equal to the no-checkpoint control, and is red on the hand-copy verb. The database refuses a checkpoint on a turn or hand row with a foreign-key violation and admits one on a bookmark.
- `tests/server/domain/import/loader/library-planes.int.test.ts`. An imported checkpoint on a swiped-away variant leaves the selected swipe current and still restores, and is red on the hand-copy import.

Release note:

> Checkpoints now save their own copy of the game state, separate from the story. On upgrade, every existing checkpoint gets that copy. Rooms whose checkpoints came from v0.1.0 to v0.2.0 can delete the bookmarked turn again; before, that failed with a database error. Checkpoints made on v0.3.x also become saved copies, so a later swipe or turn updates the tracker. Making a checkpoint no longer stops a later swipe or the next turn from updating the tracker, and an upgrade or import no longer reverts a room's state to a checkpoint. Restoring a checkpoint still brings back its saved state. Chat bundles now mark checkpoint copies; bundles written by earlier versions import as before. The upgrade rebuilds the rpg snapshot and checkpoint tables, and the pre-migration backup runs first.
