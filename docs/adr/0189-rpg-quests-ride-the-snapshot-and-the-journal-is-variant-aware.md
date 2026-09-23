---
kind: adr
status: active
updated: 2026-09-23
---

# RPG quests ride the snapshot and the journal is a variant-aware table

## Context

RPG state must follow swipes. When a member selects another variant, the room shows the state that variant produced. Quests change in place: status flips and objectives are edited. The journal only grows.

## Decision

Quests live in `rpg_snapshots.quests`, a JSON array cloned forward like inventory and cast. The snapshot's clone-forward, staging and locks give quests swipe consistency. Journal entries live in `rpg_journal`, an append-only table. A model entry stamps its producing `variantId` with CASCADE. A hand entry stamps NULL and shows on every lineage. The journal read derives visibility: `variantId IS NULL` or the variant is the slot's selected variant. No visibility column is stored. Home: `packages/db/src/schema/rpg.ts`.

## Consequences

A journal entry from a deleted swipe is deleted with it. Selecting a variant writes nothing to the journal. Quest reads and writes use the same snapshot path as the rest of the volatile state.

## Alternatives rejected

A separate variant-aware quest table: it would need event sourcing along the variant chain to rebuild each swipe's quest state. Copying the journal into every snapshot: the cost of each turn would grow with the whole archive. A stored visible flag updated on each swipe: it adds a write to every swipe and can drift, while the read can derive the same answer.
