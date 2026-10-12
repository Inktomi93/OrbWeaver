---
kind: work
status: doing
updated: 2026-10-12
priority: P2
area: chat
lane: wt/agent-a7d3f16c6a2229878
plan: test-mirror
---

# One home for the present-host read

## What

The present-host lookup is written three times: resolveChatHostUserId in packages/server/src/entry/compose/chat.ts and in entry/compose/services.ts, and loadPresentHostUserId in packages/server/src/domain/chat/persistence/reactions.ts (found by the item 890 lane). Make the chat-domain read the one home and have compose call it.

## Why

One concept with three homes drifts; a host-scope rule fixed in one copy stays wrong in the others.

## Done when

Compose calls the chat-domain read, the two compose copies are deleted, and a test pins the present-host rule.

## Evidence

Filled at landing: what ran and where its output is.
