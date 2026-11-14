---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: import
plan: import-robustness
---

# A chat bundle export fails when a seated character holds extensions nested past the card bound

## What

`cardPngIdentity` in `packages/server/src/domain/import/substrate/card.ts` parses the character's own exported card through the bounded parse, which throws `ImportCardError("card_invalid")` past `JSON_MAX_DEPTH`. `packages/server/src/domain/export/verbs/export-chat-bundle.ts` and `packages/server/src/entry/compose/assets-character.ts` call it on the live row. A row whose stored extensions nest past the bound (a card imported before the bound, or a character written with deep extensions) makes those calls throw. A co-member's deep character can therefore fail the host's bundle export.

## Why

One odd stored character must not fail a whole chat export.

## Done when

The character write refuses extensions nested past `JSON_MAX_DEPTH` at its own boundary, and the export of a room seating an already-stored deep character carries no seat identity for that character instead of failing, with a case for each.

## Evidence

Filled at landing: what ran and where its output is.
