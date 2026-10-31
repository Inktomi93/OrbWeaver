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

A numbered migration clones each turn-pinned checkpoint target into a committed hand row and re-points the checkpoint; a migration integration test deletes the turn on a migrated legacy shape and the checkpoint still restores.

## Evidence

Filled at landing: what ran and where its output is.
