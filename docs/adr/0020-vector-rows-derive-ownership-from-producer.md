---
kind: adr
status: active
updated: 2026-09-23
---

# Vector rows derive ownership from their producer

## Context

Not recorded in the ledger row.

## Decision

The vector substrate derives ownership, never stamps it: vector rows carry only their producer FK; search derives owner-scope from the producer's category (digests/segments → membership; character embeddings → `characters.ownerId`; image embeddings → the owned asset). `embeddings.store` takes producer FK refs, never an ownerId. Security gates: (1) no raw vector-table read outside the ONE search engine — producer-scope is a mandatory param; (2) scope BEFORE rank/collapse — cross-user same-content rows must never collapse into a caller's results; (3) the producer gate (`fetchOwned`/membership) is the real authz; the embedding scope is defense-in-depth.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
