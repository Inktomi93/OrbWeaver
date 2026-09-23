---
kind: adr
status: active
updated: 2026-09-23
---

# Rate limit buckets get their own schema file

## Context

Not recorded in the ledger row.

## Decision

`rate_limit_buckets` homes in `@orb/db/schema/rate-limit.ts` (producer = `transport/rate-limit`). No schema/runtime.ts; telemetry would get its own producer-named file.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
