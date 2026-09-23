---
kind: adr
status: active
updated: 2026-09-23
---

# The Agent SDK backend lives in the inference package

## Context

Not recorded in the ledger row.

## Decision

Claude Agent SDK backend = `packages/inference/src/backends/agent-sdk/` (+ `session/`). It moved with the `@orb/inference` extraction; the placement rule is unchanged — the session cache is backend-internal, never a chat concern.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
