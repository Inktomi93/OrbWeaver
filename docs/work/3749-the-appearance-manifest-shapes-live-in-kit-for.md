---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: tooling
plan: typed-enforcers
---

# The appearance manifest shapes live in kit for the client and tooling

## What

AppearanceHistoricalRow and AppearanceMatrixContractRow in packages/client/src/lib are re-declared by hand in tooling/src/floor/appearance/appearance-matrix.ts with its own zod schema, because tooling cannot import the client.

## Why

Two hand copies of one shape drift with nothing to catch it.

## Done when

One schema and its type live in packages/kit; the client builds rows from it and tooling parses with it; the tooling copies are deleted; the appearance tooling tests pass.

## Evidence

Filled at landing: what ran and where its output is.
