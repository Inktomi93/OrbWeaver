---
kind: work
status: open
updated: 2026-10-20
priority: P3
plan: test-foundation
---

# json-column normalizer has its own shape-equality check

## What

tooling/src/verify/lib/json-column-origin-context.ts lines 25 and 119 each define a sameShape mutual-assignability check, separate from the shared type relation (typeRelationAcross) and the 954 shape comparer in floor/code-facts/shape-copy.ts.

## Why

One home per concept: a third shape-equality check can disagree with the shared one.

## Done when

Both sites use typeRelationAcross or the shared comparer, with the json-column tests unchanged or corrected with proof.

## Evidence

Filled at landing: what ran and where its output is.
