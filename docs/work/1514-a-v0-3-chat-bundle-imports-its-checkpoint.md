---
kind: bug
status: open
updated: 2026-10-31
priority: P3
area: rpg
---

# A v0.3 chat bundle imports its checkpoint copy as a state step

## What

Bundles written by v0.3.0 and v0.3.1 carry a checkpoint's saved copy as an ordinary hand snapshot, because the bookmark flag did not exist. On import, createImportRpgGame inserts it as a beat, so a restored room keeps the stale state over a later swipe until the next swipe or turn. Migration 0006 already recognises the same shape in place: a hand row pinned by a checkpoint with the same created_at.

## Why

Item 1492 fixed the in-place rooms and new bundles; an old bundle still restores the bug.

## Done when

The import skips a carried hand snapshot whose createdAt equals the createdAt of a checkpoint that points at it, writing the checkpoint's bookmark from it instead; a library-planes case imports a v0.3-shape bundle, swipes, and shows the swiped state, red first.

## Evidence

`createImportRpgGame` (`packages/server/src/domain/rpg/persistence/portability-write.ts`) no longer inserts a carried hand snapshot when a checkpoint names it with the same `createdAt`, the rule migration 0006 applies in place. The checkpoint writes its bookmark from that state, as it does for every checkpoint. A hand edit a checkpoint reused was made before it, so it stays a beat.

Pinned by `tests/server/domain/import/loader/library-planes.int.test.ts`. A v0.3-shape bundle has no bookmark flag; its copy is a hand row at the turn, and the selected variant was swiped after the checkpoint. After import the room shows the swiped location, and restore brings back the copy's. This case was red before the change: it received the copy's location. The control bundle names a hand edit made a minute before its checkpoint. The room keeps that edit, and restore brings it back.

Floor: `library-planes`, `tests/server/domain/rpg`, `tests/server/domain/import` and the corpus-rpg suites (including `corpus-rpg-provider`), run serially. One case timed out at load 26: `import-bundle.int.test.ts`, "a restored card keeps its import identity through the next export and restore". That file has no rpg or checkpoint code, so the timeout carries no verdict. The rest of the floor is clean: typecheck of `packages/server` and `tsconfig.node.json`, ESLint on the changed files, whole-tree depcruise and `knip:prod`.
