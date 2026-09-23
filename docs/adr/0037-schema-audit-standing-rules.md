---
kind: adr
status: active
updated: 2026-09-23
---

# Schema audit standing rules

## Context

Not recorded in the ledger row.

## Decision

Schema audit standing rules: `audit_logs.entity_id` is the ONE sanctioned soft-ref (D24); `audit_logs.actor_user_id` is a real FK `onDelete:"set null"`. `relation` lives only on `duplicate_chat_pairs` (characters never fork), derived from `@orb/contracts/discovery`. Intentional non-columns (do not "restore"): `credentials.revokedReason` (live probe surfaces reason via the view), the neo `(userId,provider,label)` unique (the one-active-per-(owner,provider) partial unique is the key), `users.displayName`.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
