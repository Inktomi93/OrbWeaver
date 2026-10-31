---
kind: work
status: open
updated: 2026-10-30
priority: P2
area: security
plan: test-foundation
---

# Prove a guest's document search ranks only its installer's library

## What

Two owners each ingest through a guest, both libraries are indexed into an active query space, and each guest's search.documents returns only its installer's document ids. The owner scope is the ownerId installer in createPluginDocumentSearch; no test reaches it with indexed data. The 1459 lane could not activate the query space on demand (search answered search_space_reindexing after the index and databank-reindex workloads ran). Route to security-executor.

## Why

The last open case of the plugin bridge restoration row; a widened scope would leak another owner's documents to a plugin.

## Done when

The case runs through a real guest on the production host and is red with the scope widened to both owners; the bridge register row names no security remainder.

## Evidence

[Guest installer scope](../../tests/server/domain/plugin/substrate/guest-installer-scope.suite.int.test.ts) runs the case on a root with `startJobs: false`. Each owner ingests a document through its own guest. Each owner then runs the `index`, `memory-backfill` and `databank-reindex` workloads through `runAdmittedWorkload`. `search.spaceStatus` reports the embed space settled before either guest searches.

The query space stayed in `search_space_reindexing` because the `memory` scope never reported. The `embed` space promotes only when `cards`, `memory` and `documents` all record one generation (`VECTOR_SCOPES_BY_TASK`). The `memory-backfill` terminal records `memory` through `purgeMemoryVectors`, and it needs memory enabled for the owner. With `memory-backfill` removed from the case, the guest's search failed with a `SearchError` again.

Both owners embed on the same encoder, so their chunks share one geometry. Each guest's `search.documents` returns only its installer's document id.

The owner scope has two layers in `packages/server/src/domain/databank/persistence/scope.ts`: the allowlist in `resolveActiveDocumentIds` and the scan predicate in `resolveActiveDocumentScope`. With both owner predicates removed, the owner's guest received both documents and the case failed. Each layer removed alone kept the case green. The file was restored byte for byte.
