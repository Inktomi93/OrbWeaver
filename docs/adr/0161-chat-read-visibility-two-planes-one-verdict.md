---
kind: adr
status: active
updated: 2026-10-18
---

# Chat read-visibility: two planes, one verdict

## Context

Not recorded in the ledger row.

## Decision

Chat verbs that are neither host-only nor non-chat-scoped are viewer-plane verbs. They may not reach a room-plane floorless canon reader without a directly-negated `isBelowHistoryFloor` clamp. Apply D106 through production guards and read projections. D333 governs tooling.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
