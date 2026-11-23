---
kind: bug
status: open
updated: 2026-11-23
priority: P1
area: tooling
plan: unwired-code
---

# A read inside a store's values object gets its role

## What

In a store such as an insert's values object or an update's set object, the key gets the column write but a read inside the value expression gets no role, so a member read only into a store sorts as write-only. The graph census attributes most product role gaps to this family, among them embedUsageSchema.totalTokens and the embeddingBatchObservationSchema fields. The likely cause is the stores path in tooling/src/unwired/graph/build.ts taking the whole literal without walking its value expressions.

## Why

A false write-only verdict on a member the code reads is a false delete.

## Done when

A planted values object whose value reads a row member gives that member a read; a census rerun shows no gap in this family; the false write-only rows the census named leave write-only.

## Evidence

Filled at landing: what ran and where its output is.
