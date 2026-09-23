---
kind: work
status: open
updated: 2026-09-23
priority: P2
area: rpg
---

# Drive the rpg rewind fix live and check the client panel after a swipe

## What

Run the owed live drive of the rpg rewind fix (`packages/server/src/domain/rpg/persistence/snapshots.ts`): start a game, play several turns that change state, swipe and rewind, and confirm the panel shows the rewound state. On a lineage game the snapshot source must never read fallback. Also check whether the client panel invalidates after a swipe, which no test covers.

## Why

The server fix is pinned by `tests/server/domain/rpg/persistence/snapshots.int.test.ts`, but the user-visible confirmation and the client invalidation were never run.

## Done when

A snap run records the rewound panel state after a swipe on a lineage game, and any client invalidation gap it finds is fixed or filed.

## Evidence

Filled at landing: what ran and where its output is.
