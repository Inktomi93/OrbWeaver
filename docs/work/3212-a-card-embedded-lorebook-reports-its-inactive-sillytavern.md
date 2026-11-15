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

`inertActivationFields` in `packages/kit/src/world-info/index.ts` reads top-level metadata keys in the world-file spelling. Card import stores an embedded book's entry whole (`loreEntryMetadata` in `packages/server/src/primitives/serde/card/index.ts`), so a card entry keeps the card spelling: its own names for secondary keys, keys, order, enabled and name, a word for position, and the case, whole-word, scan-depth, probability, group, weight, recursion, sticky, cooldown and delay fields under its extensions object in snake case. The editor and the import report then show nothing kept for a card book, and the card identity hash, which reads the same function, misses those fields. One normaliser reads each field from every place a file can hold it, first defined value wins, and both readers use it.

## Why

An owner reads a stored knob as absent when it is stored and inert, and a card edit to such a field does not change the book's identity.

## Done when

A test imports a card book whose entry has secondary keys and a probability below always and finds both listed as kept in the editor read and the import report.

## Evidence

Filled at landing: what ran and where its output is.
