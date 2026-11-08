---
kind: bug
status: open
updated: 2026-11-08
priority: P2
area: tooling
---

# Widen the mutation checker when an imported file feeds an augmentation

## What

mutant-world.ts widens to the whole program only when the mutated file itself augments. A mutant in a file the augmenting file imports, such as route.ts feeding the typeof router augmentation, is checked over two files and passes.

## Why

A mutant that breaks the router type through an imported route survives, so the score overstates the suite.

## Done when

A mutant in a file reachable from an augmenting file is checked against the whole program, with a red-first route.ts fixture.

## Evidence

Filled at landing: what ran and where its output is.
