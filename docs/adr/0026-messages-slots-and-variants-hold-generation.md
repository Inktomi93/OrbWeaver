---
kind: adr
status: active
updated: 2026-09-23
---

# Messages are slots and variants hold the generation

## Context

Not recorded in the ledger row.

## Decision

`messages` is a pure SLOT (id, chatId, seq, role, attribution, `selectedVariantId`, excludedFromPrompt, timestamps — no content/economics); `message_variants` is the full generation record. Every message has ≥1 variant (uniform, no if-is-user). `selectVariant` flips the pointer — zero copy. Attribution is slot-level (a swipe never changes the speaker).

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
