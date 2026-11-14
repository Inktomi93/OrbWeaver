---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: import
plan: import-robustness
---

# A card refused for nesting too deep shows the generic invalid-card message

## What

`fromText` in `packages/server/src/domain/import/substrate/card.ts` refuses a card nested past `JSON_MAX_DEPTH` (128) with reason `card_invalid`. The client keys its copy on the reason (`packages/client/src/lib/card-import-copy.ts`), so the owner sees "That file is a character card, but its data is incomplete or invalid, so Orbweaver can't import it." Nothing tells them the card is valid but nested too deep. A distinct reason code (for example `card_too_deep`) in `packages/contracts/src/import/card-result.ts` with its own copy would.

## Why

An owner who knows the card works in SillyTavern reads "incomplete or invalid" as wrong, and has no way to act on it.

## Done when

A card nested too deep carries its own reason code, and the dialog and folder report say the card nests deeper than Orbweaver reads, with a case through the dialog door.

## Evidence

Filled at landing: what ran and where its output is.
