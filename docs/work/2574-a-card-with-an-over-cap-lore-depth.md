---
kind: bug
status: open
updated: 2026-11-13
priority: P2
area: import
plan: import-robustness
---

# A card with an over-cap lore depth imports, and a failed card import leaves no half-made character

## What

A card import writes the character row and then its tags, lore book and scripts as separate steps in `packages/server/src/domain/import/verbs/import-character.ts`. When a later step throws, the character row stays with no lore book, and the person sees the raw error text. The over-cap lore depth that first showed this now imports: a depth past the injection cap reads as no depth directive, as the persona import reads it.

## Why

One out-of-range number in one lore entry loses the whole card, in words the person cannot act on, and leaves a character that looks imported and has no lore.

## Done when

A card import that fails after the character row is written leaves no character, or the dialog says what was kept, with a test through the production card import. The carried lore book and scripts are checked before the character row is written where that is possible. A refusal reads as a plain sentence from the import copy home.

## Evidence

Filled at landing: what ran and where its output is.
