---
kind: adr
status: active
updated: 2026-10-19
---

# Firehose import allowlist: the unclamped all-chat stream may be named only by the server composition root and its transport barrel

## Context

Not recorded in the ledger row.

## Decision

The firehose (`subscribeAllChatEvents`) is UNCLAMPED BY TYPE: no chatId, no caller, no per-member history-floor verdict. Any per-USER surface fed from it ships a join-history leak. Homes: the `orb/firehose-import-allowlist` selector in `eslint.config.ts` (the occurrence check). Enforcers: that lint rule, with the composition root and the transport barrel as its two exempt homes.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
