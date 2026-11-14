---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: character
plan: cross-surface-consistency
---

# A bulk character result sends a raw error message to the wire and the toast

## What

classifyBulkTagFailure in packages/server/src/domain/character/substrate/bulk-tag-result.ts puts any Error's message into CharacterBulkFailure.error.message. A storage failure reaches the client as raw database text, and characterBulkRemoveRefusal and characterBulkTagRefusal in packages/client/src/features/character/lib/character-refusal-notice.ts now show it in a toast.

## Why

The contract comment in packages/contracts/src/character/index.ts says error.message is wire-safe text, never a raw Error. A trigger or constraint failure shows SQLite text to the reader.

## Done when

The classifier maps known refusal classes to wire-safe text and every other failure to one fixed message, and a server case with a storage refusal asserts the wire message is the fixed one.

## Evidence

Filled at landing: what ran and where its output is.
