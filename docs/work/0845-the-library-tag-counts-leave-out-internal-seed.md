---
kind: bug
status: open
updated: 2026-10-11
priority: P3
area: client
---

# The library tag counts leave out internal seed tags

## What

The suggestion inbox hides the seed tags assistant, default and utility (INTERNAL_SEED_TAG_NAMES), but the per-tag pendingSuggestions counts are computed in SQL (packages/server/src/domain/tag/persistence/queries.ts) and still include them.

## Why

Counts and the inbox disagree.

## Done when

The suggestion inbox hides internal seed tags through one shared definition (contracts tag, used by the seeder too), and the library reports their true pending state, so no screen calls them unused while prune keeps them.

## Evidence

Filled at landing: what ran and where its output is.
