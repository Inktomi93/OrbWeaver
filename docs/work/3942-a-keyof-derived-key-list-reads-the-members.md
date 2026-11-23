---
kind: bug
status: open
updated: 2026-11-23
priority: P2
area: tooling
plan: unwired-code
---

# A keyof-derived key list reads the members it spells

## What

The delete trial refuted getOrBuildIndex.id (packages/ui/src/fuzzy-search/fuzzy-search.ts): deleting it changes keyof T, and a readonly (keyof T & string)\[] list at fuzzy-search.ts:58-59 no longer assigns to string\[]. The graph counts a keyof use as a key use, not a read, so the member reads untouched.

## Why

A key list typed from keyof depends on the member for its type, so the graph calls a live member dead.

## Done when

A planted keyof-derived key list that a delete breaks keeps the member out of member-untouched, the case fails without the fix, and plain keyof key uses that a delete does not break keep their current bucket.

## Evidence

Filled at landing: what ran and where its output is.
