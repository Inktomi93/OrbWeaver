---
kind: adr
status: active
updated: 2026-09-23
---

# There is no simple send

## Context

Not recorded in the ledger row.

## Decision

There is no `simpleSend`: deleted outright (byte-identical to a solo `send` — a roster-of-1 round). "Commit without turn," when built, is named `commitMessage`/`injectMessage`.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
