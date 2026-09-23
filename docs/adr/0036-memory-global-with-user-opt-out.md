---
kind: adr
status: active
updated: 2026-09-23
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
