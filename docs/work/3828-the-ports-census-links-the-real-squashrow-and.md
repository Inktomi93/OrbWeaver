---
kind: tooling
status: doing
updated: 2026-11-21
priority: P3
area: tooling
lane: wt/agent-a3c5ad4cfff9d00e8
plan: unwired-code
---

# The ports census links the real SquashRow and NamedRow chain

## What

After 3826 the census follows a planted generic-bound chain, but the real pair still reports review with no flow: NamedRow (packages/server/src/domain/chat/assembly/names.ts) reaches squashSameRole<T extends SquashRow> in role-squash.ts through runSquash in shape.ts.

## Why

The fix proved on a planted case does not reach the case it was built for.

## Done when

A planted case copying the real declarations and calls is red first, the census links NamedRow to SquashRow on the real tree, and the orchestrator's ports rerun shows the pair out of review.

## Evidence

Filled at landing: what ran and where its output is.
