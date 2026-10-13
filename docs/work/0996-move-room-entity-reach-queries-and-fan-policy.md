---
kind: work
status: doing
updated: 2026-10-13
priority: P1
area: server
lane: codex/compose-chat-964
plan: test-foundation
---

# Move room entity reach queries and fan policy out of compose

## What

Continue compose cleanup in `packages/server/src/entry/compose/room-reach.ts`. Move reach queries to their table owners and room refresh policy to its owning domain through injected operations. Keep entry limited to graph wiring.

## Why

Reach and delete-capture rules remain hidden in composition, with queries spanning membership and attachment owners. Their security and error-isolation semantics must survive the move before the real harness is built.

## Done when

Preserve present seats, persona anchors, all book and document scopes, tenant asymmetries, deduplication and id-free live events. Capture before deletion; fan only after confirmed owned deletion, including the confirmed regex subset. Preserve logged failure isolation and exhaustive event handling. Retain meaningful production cases and discriminate foreign-delete and reach defects. Remove obsolete code and compose exceptions without new grants or sideways imports.

## Evidence

Filled at landing: what ran and where its output is.
