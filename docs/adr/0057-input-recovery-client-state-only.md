---
kind: adr
status: active
updated: 2026-09-23
---

# Input recovery is client state only

## Context

Not recorded in the ledger row.

## Decision

Input recovery (restoring a consumed steering draft) is strictly client state (Zustand + TanStack Form) — never a backend script or verb; the backend sees only the resulting `guided` steer parameter.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
