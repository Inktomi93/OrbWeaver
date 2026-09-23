---
kind: adr
status: active
updated: 2026-09-23
---

# A db enum derives from a contracts tuple

## Context

Not recorded in the ledger row.

## Decision

A db enum column derives from a CONTRACTS tuple: any enum axis a db column constrains lives in `@orb/contracts/*` (db derives + CHECK-enforces + test-mirrors it; e.g. `WORKLOAD_KINDS`/`WORKLOAD_STATUSES` → contracts/workloads, `IMAGE_LENSES` → contracts/embeddings). db never re-spells a union and never falls back to bare `text()` to dodge an import.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
