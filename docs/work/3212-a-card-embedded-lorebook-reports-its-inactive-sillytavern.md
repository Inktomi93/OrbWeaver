---
kind: bug
status: open
updated: 2026-11-15
priority: P2
area: world-info
plan: import-robustness
---

# A card-embedded lorebook reports its inactive SillyTavern fields

## What

`inertActivationFields` in `packages/kit/src/world-info/index.ts` reads top-level metadata keys in the world-file spelling such as the secondary keys name. Card import stores an embedded book's entry whole (`loreEntryMetadata` in `packages/server/src/primitives/serde/card/index.ts`), so a card entry keeps its own spelling for secondary keys and keeps other activation fields under its extensions object. The editor and the import report then show nothing kept for a card book, and the card identity hash reads the same function. Make the read cover both spellings, or normalise at the card import, without changing the identity of books already imported.

## Why

An owner reads a stored knob as absent when it is stored and inert, and a card edit to such a field does not change the book's identity.

## Done when

A test imports a card book whose entry has secondary keys and a probability below always and finds both listed as kept in the editor read and the import report.

## Evidence

Filled at landing: what ran and where its output is.
