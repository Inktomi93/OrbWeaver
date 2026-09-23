---
kind: adr
status: active
updated: 2026-09-23
---

# Stamp an owner only when unreachable by FK

## Context

Not recorded in the ledger row.

## Decision

The ownership-stamp rule: *can you reach a row's owner by following ONE FK to an owned entity?* Yes → DERIVE (no `ownerId` column). No → KEEP `ownerId` (it's the partition key, not a mirror). KEEP: top-level owned entities (characters, personas, presets, world_books, tags, user_credentials, workloads) + parentless per-user aggregates (owner_stats, daily_stats, model_stats, theme_clusters, keyword_cooccurrence). DERIVE: everything with a single owning parent (embeddings/digests/segments per D20, character_summaries/keyword_profiles/stats, digest_theme_assignments, duplicate\_\*\_pairs per D24) and association/curation rows anchored by a required FK to owned canon (gallery_items, roster_preset_members, proposals, character_sprites, imagery_generations). Only TRUE PRODUCERS (the user's authored artifact with no owned anchor) stamp `ownerId`. A new table's `ownerId` must pass the test or it's a doubling.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
