---
kind: work
status: open
updated: 2026-10-24
priority: P3
area: inference
plan: restoration-register
---

# An opt-in cold-cache reranker case downloads and serves the seeded model

## What

The 0991 probe's cold-cache case has no home: the first rerank call on an empty cache should download weights through the shipped local-light loader and serve the seeded model.

## Why

The first-run model download is a user-visible path no maintained case exercises.

## Done when

A case tagged local-model-cache runs only with ORB_LOCAL_LIGHT_E2E=1, passes when opted in, and skips by default.

## Evidence

[Cold cache case](../../tests/server/domain/connection/local-light-cold-cache.suite.int.test.ts) is tagged `local-model-cache`. `vitest.config.ts` `testTagFilters` removes the default `!local-model-cache` exclusion only when `ORB_LOCAL_LIGHT_E2E=1`.

- Default run: the file reports one skipped test.
- Opted-in run: not run in this lane. The box load was above the 12 gate the brief set for a download. Run `ORB_LOCAL_LIGHT_E2E=1 pnpm test tests/server/domain/connection/local-light-cold-cache.suite.int.test.ts` on a quiet box with network.

The case runs the production entries `seedUserConnections` and `roleClientsFor(...).rerank` on a root whose native kernel module delegates to the library and the network.
