---
kind: adr
status: active
updated: 2026-09-23
---

# Firehose import allowlist: the unclamped all-chat stream may be named only by the server composition root and its transport barrel

## Context

Not recorded in the ledger row.

## Decision

The firehose (`subscribeAllChatEvents`) is UNCLAMPED BY TYPE: no chatId, no caller, no per-member history-floor verdict. Any per-USER surface fed from it ships a join-history leak. Homes: `tooling/src/verify/gates/firehose-import-allowlist.ts` (the occurrence arm) + `tooling/src/verify/gates/firehose-import-allowlist-health.ts` (declaration health). Enforcers: the `firehose-import-allowlist` gate family with reviewed-grant authority. Minted 2026-09-18 (#2354) — split from the misattributed D79 citation (D79 = "ONE structured-output stack").

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
