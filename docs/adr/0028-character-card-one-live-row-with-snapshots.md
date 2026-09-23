---
kind: adr
status: active
updated: 2026-09-23
---

# The character card is one live row with snapshots

## Context

Not recorded in the ledger row.

## Decision

No `character_versions`: the card is the flat, live `characters` row, edited in place. History = `character_snapshots` (append-only JSON blobs, git-commit-style) that NOTHING FKs or gates on; restore = copy blob → live row (snapshotting current first). Digests key on chatId + `chat_digest_speakers` — no character-version anywhere.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
