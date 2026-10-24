---
kind: bug
status: open
updated: 2026-10-24
priority: P2
area: import
---

# Restore fidelity gaps after hash-identity relink

## What

Found while landing items 1290 and 1279; parts 1 and 3 were observed in a composed probe, the rest found by reading. (1) Seeded characters carry a null importHash, so restoring their exported cards onto a fresh box creates a second copy of each (charlotte-2 and so on). (2) createCharacterSchema strips starred, so an imported card's fav never lands and a restore unstars every card. (3) Rows imported from a fav:true file before the 1290 identity change keep their old identity, so re-uploading that original file creates a duplicate. (4) Databank sourceAssetId and imagery generations still re-link by carried id only; with the fourth asset check now succeeding on same-owner bytes, a box holding those bytes under another id leaves them dangling without a failure. (5) characters.background_override is not in the card export, so a card's background is lost on restore.

## Why

A clean restore should reproduce the library: no doubled starter cast, no lost stars or backgrounds, and no silent dangling reference behind a success report.

## Done when

Each part is reproduced or refuted with a composed round trip before any fix. Seeded cards dedup against their own export (for example through a seeded identity); an imported or restored card keeps its star; a legacy fav:true row re-imports onto itself or the drift is accepted in the item with a reason; databank and imagery referrers resolve by content hash with the carried id as fallback; a card's background override travels in its export. The composed round trip in tests/server/domain/import/loader/import-bundle.int.test.ts covers each, red first.

## Evidence

Filled at landing: what ran and where its output is.
