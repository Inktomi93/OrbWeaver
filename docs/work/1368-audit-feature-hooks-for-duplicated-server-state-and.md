---
kind: work
status: open
updated: 2026-10-25
priority: P2
area: client
---

# Audit feature hooks for duplicated server state and wrong communication channels

## What

Inventory feature hooks and their consumers against `docs/law/client-architecture-state-and-gates.md` section 12. Inspect copied query results in local stores, redundant projection plumbing, effect-based synchronization, and incomplete invalidation. Existing cached cross-domain reads in RPG and persona are valid examples, not presumed defects. Include hook-bearing modules outside the hooks bucket and state the audited scope.

## Why

Server truth belongs in the shared query cache; client pointers belong in state; UI extensions belong in contribution registries. Similar procedure names do not establish identical query keys or shared cached results.

## Done when

Record evidence-backed keep or repair decisions with source and consumer paths. Repair confirmed channel or freshness defects in related batches. Add production-backed cases for shared-key deduplication and event-driven freshness where uncovered. Preserve legitimate local draft state and imperative subscriptions. Do not enforce a blanket hooks-use-tRPC rule, file-length quota, or new policy platform. Keep unresolved scopes explicit.

## Evidence

Filled at landing: what ran and where its output is.
