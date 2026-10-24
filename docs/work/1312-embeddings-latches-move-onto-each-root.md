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

- `createEmbeddingLatches()` builds the availability latch and the degrade reporter. `buildSearchDiscovery` passes them to `createEmbeddingsService` as `EmbeddingsContext.latches`, and `caption.ts` and `image.ts` read them from there. Both files are off `MODULE_STATE_OWN_PROCESS`.
- `tests/server/foundation/observability/root-isolation.int.test.ts` "one root's unservable summarize model does not skip another root's analysis call": red on the old source (the second root made 0 analysis calls), green after the move. A planted shared latch in `createEmbeddingLatches` turns it red again.
- `orb/no-module-state` over `packages/server`: 1812 files, 0 findings. `pnpm typecheck`, `pnpm depcruise` and `pnpm knip:prod` exit 0. `pnpm test` on `tests/server/foundation/observability`, `tests/server/domain/embeddings`, `tests/server/entry/compose` and the two corpus image suites: 34 files, 147 tests passed.
