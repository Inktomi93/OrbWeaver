---
kind: adr
status: active
updated: 2026-09-23
---

# Member card visibility is a host-set room dial

## Context

Not recorded in the ledger row.

## Decision

Member card visibility is a host-set per-room dial: `chatMetadata.group.memberCardVisibility` ∈ `name-avatar | sheet | sheet+lore | full`, seeded from `userSettings.groupDefaults.memberCardVisibility` (default `sheet`). Member view is read-only + while-present; owner/host always sees `full`; edit/clone/export stay owner-only. Reserved (not v1): a per-character `maxMemberVisibility` ceiling.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
