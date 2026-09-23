---
kind: adr
status: active
updated: 2026-09-23
---

# The entry folder layout is locked

## Context

Not recorded in the ledger row.

## Decision

`entry/` bucket shape is LOCKED: root files (`index.ts`, `app.ts`, `lifecycle.ts`) · `auth/` (the seam) · `boot/` (migrate/seed/reclaim) · `compose/` (non-auth wiring) · `http/` (routes) · `import/` (bulk composition driver). New files land INSIDE the right bucket; the lock is the bucket roles, not a closed file list.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
