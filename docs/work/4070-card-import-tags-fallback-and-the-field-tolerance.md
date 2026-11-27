---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: import
lane: wt/agent-adf56b71cc859a547
plan: unwired-code
---

# Card import tags fallback and the field-tolerance test follow the house

## What

After the one-schema card import, a card with a malformed data.tags falls back to the root tags without a test or note, and tests/server/domain/import card-field-tolerance.int.test.ts copies the note format from substrate/card.ts instead of importing it.

## Why

An untested fallback can change silently, and a copied format drifts from the one the product writes.

## Done when

The tags fallback has a test and a note when it applies, and the tolerance test imports the note format from its production home.

## Evidence

Filled at landing: what ran and where its output is.
