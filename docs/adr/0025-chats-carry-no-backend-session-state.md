---
kind: adr
status: active
updated: 2026-09-23
---

# Chats carry no backend session state

## Context

Not recorded in the ledger row.

## Decision

`chats` carries no backend session state: agent-sdk session lineage/staleness lives entirely in the backend session store (`session_entries`), keyed by chatId. `chats.compactSummary` + `compactedAtSeq` STAY — a portable compaction checkpoint (chat canon, used by stateless runners too).

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
