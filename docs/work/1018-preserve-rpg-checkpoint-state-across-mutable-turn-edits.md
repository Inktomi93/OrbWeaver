---
kind: bug
status: doing
updated: 2026-10-14
priority: P1
area: rpg
lane: codex/owner-read-provenance-1016
plan: test-foundation
---

# Preserve RPG checkpoint state across mutable turn edits

## What

Checkpoint creation labels the current snapshot without making a mutable turn snapshot immutable. A later legal host hand edit changes the bookmarked row, so restore returns the later state instead of the saved state. Preserve the bookmarked state through the canonical snapshot and hand-write owners.

## Why

The native corpus member and recovery case reproduces the defect after a real folded turn. Hand-only checkpoint coverage starts from an already committed row and misses this branch. Dependent RPG corpus qualification requires the production correction.

## Done when

Reproduce with the real composition root and production turns. Preserve the checkpoint state after later hand edits and restore exact state. Resolve atomic snapshot and checkpoint persistence with existing per-game serialization and flush ownership. Cover failed writes, concurrent hand edits and retained generation or variant identity without copied assemblies or fake rows. Preserve host and game scoping, immutable history and restored hand-row semantics. A production defect control fails and restored affected cases pass.

## Evidence

Native corpus run `orbweaver-959-rpg-1707353-2026-10-14T13-49-07-067Z` fails exact restoration after a real folded turn, checkpoint and later host edit. The bookmarked snapshot remains mutable. Existing committed hand-row coverage does not exercise this branch. Production source remains unchanged pending the owning correction.
