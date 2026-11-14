---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: server
---

# The boot sweep of dry-run workloads keeps the newest row for each owner, proven

## What

The boot sweep in `packages/server/src/domain/workloads/persistence/queries.ts` keeps each owner's newest finished dry run of a kind. The restart case in `tests/server/domain/import/persistence/import-staging-lifetime.int.test.ts` has one owner. With the sweep's owner condition replaced by a condition that is always true, every case still passes.

## Why

Without the owner condition, another account's newer dry run deletes this account's review row at boot, and no test reports it.

## Done when

A server case through the composed root seats two owners, each with a finished dry run, restarts, and shows both rows kept. The case fails when the owner condition is removed.

## Evidence

Filled at landing: what ran and where its output is.
