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

Approved split: chat owns membership reads and refresh dispatch; world-info, databank and regex own their attachment reach queries in persistence. Preserve joined statements and ownership-safe views under Tier-1 DB law. Inject narrow resolvers into chat; entry constructs the graph.

The world-book owner lookup exception covers confirmed owner-scoped book changes and attachment removals. It returns no private book content and grants no general owner-agnostic read. Preserve present-host and present-human predicates. Regex removal must fan only the ids returned by its owned delete.

Direct regex and databank room fans use the chat-owned live fan factory without fabricated query ports. Preserve deduplication, id-free events, exhaustive dispatch and logged failure isolation. Implementation and its focused proof remain in progress.
