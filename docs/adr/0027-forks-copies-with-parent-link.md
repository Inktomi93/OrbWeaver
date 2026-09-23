---
kind: adr
status: active
updated: 2026-09-23
---

# Forks are copies with a parent link

## Context

Not recorded in the ledger row.

## Decision

Forks = copy + `chats.parentChatId` self-FK (SET NULL on parent delete). Lineage walk is membership-gated — a fork grants no parent-chat read. ONE branch axis (chat forks); no message-level branching, no shared-history DAG.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
