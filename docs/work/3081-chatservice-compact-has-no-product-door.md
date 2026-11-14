---
kind: decision
status: open
updated: 2026-11-14
priority: P2
area: chat
plan: typed-enforcers
---

# ChatService.compact has no product door

## What

`compact` is built in `packages/server/src/domain/chat/verbs/compaction.ts` and admitted in `packages/server/src/domain/chat/verbs/admission.ts`, but no tRPC procedure, automation action, plugin port or client hook calls it. Only tests call `services.chat.compact`. Managed compaction inside a turn uses `runCompaction` directly.

## Why

An unwired verb carries authority and consent code that no user can reach, and reviews reason about a caller that does not exist.

## Done when

Either a host-only door (tRPC procedure plus a client control) calls `compact` with its request principal, or the verb, its admission entry and its tests are deleted with the reason recorded.

## Evidence

Filled at landing: what ran and where its output is.
