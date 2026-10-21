---
kind: work
status: blocked
updated: 2026-10-21
priority: P3
blocked: owner
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

Owner-directed tooling pause: this work is parked outside the test-foundation and test-mirror programs. Preserve source and evidence; resume only with explicit owner authorization. Custody: `reports/review/tooling-park-2026-10-21/`.
