---
kind: adr
status: superseded
updated: 2026-10-03
superseded-by: docs/adr/0293-memory-is-off-until-each-user-turns-it-on.md
---

# Memory is global with a user opt-out

## Context

Not recorded in the ledger row.

## Decision

Memory enable/disable is GLOBAL (`AppSettings.memoryDefaults.mode`; `'off'` disables — no separate boolean) layered over the per-user opt-out (`UserSettings.memory.enabled`, a JSON field). There is NO per-chat memory column.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
