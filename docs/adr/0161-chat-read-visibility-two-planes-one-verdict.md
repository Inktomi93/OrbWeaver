---
kind: adr
status: active
updated: 2026-10-18
---

# Chat read-visibility: two planes, one verdict

## Context

Not recorded in the ledger row.

## Decision

A VIEWER-PLANE chat verb (matrix authority other than `host`/`non-chat-scoped`) may not reach a ROOM-PLANE floorless canon reader without a directly-negated `isBelowHistoryFloor` clamp. Enforcement home: `tooling/src/verify/gates/chat-viewer-plane-canon-reads.ts`. D321 governs enforcement migration.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
