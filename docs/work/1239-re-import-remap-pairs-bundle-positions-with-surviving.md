---
kind: bug
status: open
updated: 2026-10-23
priority: P2
area: chat
---

# Re-import remap pairs bundle positions with surviving slots

## What

`packages/server/src/domain/chat/persistence/import-write.ts` `loadImportedIdentity` (the R6 identity used when a room is re-imported, which re-links overlays such as the rpg campaign) pairs bundle message positions with the room's surviving slots ordered by seq. `deleteMessages` hard-deletes a slot without renumbering (`persistence/canon-write.ts:796`), so a deletion after the first import shifts every later pairing by one. Item 1236's persona heal had the same defect and now matches by `seq = index + origin` through `importSeqOrigin`; the remap still uses position.

## Why

A re-import after any deletion links overlays to the wrong rows, silently.

## Done when

The remap matches by seq offset from the proven import origin, shares `importSeqOrigin` with the heal, and a regression deletes a slot between import and re-import and asserts every overlay lands on the row it was exported from.

## Evidence

Filled at landing: what ran and where its output is.
