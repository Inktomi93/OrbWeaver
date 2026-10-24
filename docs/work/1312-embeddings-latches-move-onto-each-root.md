---
kind: bug
status: open
updated: 2026-10-24
priority: P2
area: server
plan: test-foundation
---

# The embeddings announce and availability latches move onto each root

## What

`domain/embeddings/substrate/avatar-analysis-availability.ts` keeps its `unservable` and `announced` Sets at module scope, and `domain/embeddings/substrate/image-space-degrade.ts` keeps its `announced` Set there. Both files sit on `MODULE_STATE_OWN_PROCESS` in `eslint.config.ts`. Move each into a latch object the root builds and threads through the embeddings indexer context.

## Why

The avatar latch changes behaviour: one root's "model unservable" verdict skips the provider call for every other root in the process, such as two test roots in one integration worker.

## Done when

Both files are off `MODULE_STATE_OWN_PROCESS`, `orb/no-module-state` still reports zero over `packages/server/src`, and a two-root case shows one root's latch does not reach the other.

## Evidence

Filled at landing: what ran and where its output is.
