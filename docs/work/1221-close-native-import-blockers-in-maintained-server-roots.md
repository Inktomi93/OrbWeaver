---
kind: bug
status: doing
updated: 2026-10-21
priority: P1
lane: codex/native-import-blockers-1221
plan: test-foundation
---

# Close native import blockers in maintained server roots

## What

Scoped validation from tests/support/node/chat/composed.ts reports a run-marker.ts and run-marker-join.ts import cycle. The entry portability contract also imports raw database and SQLite table types instead of an inert canonical type door.

## Why

These dependencies block the required native import floor for rebuilt chat consumers.

## Done when

Scoped dependency-cruiser passes without rule changes, exemptions or suppressions. Types retain canonical homes. Marker ownership, process completion and portability coverage retain their behavior, with affected controls passing.

## Evidence

Filled at landing: what ran and where its output is.
