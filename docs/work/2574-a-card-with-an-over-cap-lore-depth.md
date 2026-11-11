---
kind: bug
status: open
updated: 2026-11-11
priority: P2
area: import
---

# A card with an over-cap lore depth imports, and a failed card import leaves no half-made character

## What

A SillyTavern card whose lore entry carries an injection depth over the cap makes the entry metadata narrowing throw in packages/server/src/primitives/serde/card/index.ts. The whole card import fails, the person sees raw schema error text, and the character import dialog leaves the character row behind with no lore book. A persona with the same over-cap depth is read as the at-depth default.

## Why

One out-of-range number in one lore entry loses the whole card, in words the person cannot act on, and leaves a character that looks imported and has no lore.

## Done when

An over-cap lore depth is read by the same rule the persona import follows, with a test through the production card import that pins the entry's stored depth. A card import that fails after the character row is written leaves no character, or the dialog says what was kept, with a test. A refusal reads as a plain sentence from the import copy home.

## Evidence

Filled at landing: what ran and where its output is.
