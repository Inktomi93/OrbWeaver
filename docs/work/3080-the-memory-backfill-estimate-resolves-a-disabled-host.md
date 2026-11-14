---
kind: bug
status: open
updated: 2026-11-14
priority: P2
area: chat
plan: typed-enforcers
---

# The memory backfill estimate resolves a disabled host's embedding space

## What

`chatCalls` in `packages/server/src/domain/chat/memory/backfill/estimate.ts` reads the host with `hostUserIdOf` and calls `ctx.resolveMemoryEmbedSpace(hostUserId)`, which runs `embeddings.resolveGeneration` on that host. No consent read comes first. The sweep it estimates reads `hostConsentOf` per chat (`loadCharacterIdsAndHost` in `packages/server/src/domain/chat/memory/backfill/backfill.ts`) and skips a disabled host's rooms. Reached when the box owner estimates a bulk memory backfill (`ownerId: null`, every chat) or names another owner.

## Why

A generation resolve can width-probe the owner's encoder and move its target, which `packages/server/src/domain/embeddings/verbs/vacuous-memory-receipt.ts` forbids for a disabled owner. The estimate also counts calls the run will never make.

## Done when

`chatCalls` reads `hostConsentOf` over the same participants and returns 0 unless the host consents, as the sweep does. A composed-root case estimates a bulk backfill over a disabled host's memory room and sees no embedding request and that room's calls left out; re-enabling the host restores both.

## Evidence

Filled at landing: what ran and where its output is.
