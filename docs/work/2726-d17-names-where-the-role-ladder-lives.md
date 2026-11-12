---
kind: work
status: open
updated: 2026-11-12
priority: P3
area: docs
plan: authorization-and-visibility
---

# D17 names where the role ladder lives

## What

D17 still says that owner over admin lives only in the `can()` seam. Since the role predicates moved, the ladder lives in `userRoleSatisfies` in the identity contracts and `can()` only decides, as D121 states.

## Why

Two decisions disagree on where the role ladder lives.

## Done when

The D17 sentence matches D121, inside the decision size cap.

## Evidence

Filled at landing: what ran and where its output is.
