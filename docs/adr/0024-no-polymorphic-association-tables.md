---
kind: adr
status: active
updated: 2026-09-23
---

# No polymorphic association tables

## Context

Not recorded in the ledger row.

## Decision

NO polymorphic association tables: cross-entity relations are per-type FK tables with CASCADE (`duplicate_character_pairs`, `duplicate_chat_pairs`, the tag junctions), never `(type, untyped_id)` soft refs. ONE sanctioned soft-ref exception: `audit_logs.entity_id` (append-only log that must outlive its referent).

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
