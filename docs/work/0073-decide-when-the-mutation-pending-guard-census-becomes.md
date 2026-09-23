---
kind: tooling
status: open
updated: 2026-09-23
priority: P3
area: verify
---

# Decide when the mutation pending-guard census becomes an active gate

## What

The review mirror generates a census of `Button` and `Switch` handlers whose own function body calls `mutate` or `mutateAsync`, classifying each pending guard as direct, derived, unresolved or missing. It stays review evidence. It may become an active gate only after the genuine missing guards are fixed and a cold census shows the remaining derived guards classify mechanically, without broad dataflow or admissions.

## Why

The gate family design that set this condition is deleted, and no work item carried the activation condition.

## Done when

Either the census reports zero missing guards on the real tree and an active gate enforces it, or the owner rules it stays review-tier and this item closes with that ruling.

## Evidence

Filled at landing: what ran and where its output is.
