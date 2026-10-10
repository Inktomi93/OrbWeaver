---
kind: bug
status: open
updated: 2026-10-10
priority: P2
area: server
---

# Boot refreshes stale planner statistics before serving

## What

The prod freeze (72 s) was stale sqlite_stat1: messages and message_variants recorded as 4 rows against 26k and 101k, so chatRecencyExpr (packages/db/src/kit/chat-visibility.ts:84) planned a bare SEARCH per chat; character.list ran 5-12 s each on v0.2.0. Commit 04464f18f2 runs a bounded ANALYZE in optimizeDb at boot (packages/db/src/client/index.ts:693, lifecycle.ts:833). Nothing pins it.

## Why

Removing the boot ANALYZE brings back a whole-process freeze on large libraries.

## Done when

Tests seed a large message table with stats claiming tiny tables and assert that both boot and a completed bulk import refresh them, so the recency subquery plans with messages_chat_seq_unique. Each fails when its optimizeDb call is removed.

## Evidence

Filled at landing: what ran and where its output is.
