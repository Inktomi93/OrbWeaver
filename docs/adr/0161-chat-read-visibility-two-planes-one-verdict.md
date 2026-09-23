---
kind: adr
status: active
updated: 2026-09-23
---

# Chat read-visibility: two planes, one verdict

## Context

Not recorded in the ledger row.

## Decision

A VIEWER-PLANE chat verb (matrix authority other than `host`/`non-chat-scoped`) may not reach a ROOM-PLANE floorless canon reader without a directly-negated `isBelowHistoryFloor` clamp. Homes: `tooling/src/verify/gates/chat-viewer-plane-canon-reads.ts` (the occurrence guard) + `tooling/src/verify/gates/chat-viewer-plane-canon-reads-health.ts` (the three fail-loud blindness guards). Enforcers: the `chat-viewer-plane` gate family. Split from the misattributed D79 citation (D79 = "ONE structured-output stack").

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
