---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: embeddings
plan: unwired-code
---

# One home for the memory-enabled read behind the compose let hop

## What

packages/server/src/domain/embeddings/contract/reindex.ts VacuousMemoryReceiptDeps.isMemoryEnabled hand-types what IsMemoryEnabledOp in packages/contracts names. The census misses it because the value passes through a mutable local in entry/compose/services.ts. Type the member by the contracts op, and teach the census to follow a value through a local binding or record why it cannot.

## Why

One home per concept; a let hop is a blind spot in the port census.

## Done when

The member types by IsMemoryEnabledOp, and the census either reports a planted let-hop restatement or the plan records the limit.

## Evidence

Filled at landing: what ran and where its output is.
