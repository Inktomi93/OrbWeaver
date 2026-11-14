---
kind: decision
status: open
updated: 2026-11-14
priority: P3
area: world-info
---

# Decide one home for the chat book host predicate

## What

The chat scope of loadWorldInfoSources in packages/server/src/domain/chat/assembly/world-info/pool.ts and listHostChatBooks in packages/server/src/domain/world-info/persistence/queries.ts both spell chat_books.chat_id = room and world_books.owner_id = host. The two agree today. Chat cannot import world-info, so one home needs either an injected world-info op that the pool reads chat entries through, or a shared predicate in a package both may import.

## Why

The rule is security-relevant (D64): if one spelling changes, the rack and the prompt disagree about which books the room applies.

## Done when

The owner rules on the home; either the pool reads chat books through an injected world-info op, or both reads use one shared predicate, and the stale-row case covers both readers.

## Evidence

Filled at landing: what ran and where its output is.
