---
kind: bug
status: open
updated: 2026-11-15
priority: P2
area: chat
---

# A degraded save pass swallows only embedder and space failures

## What

A save regex pass on a greeting or an edit whose scripts read the memory or databank macro runs retrieval in degrade mode. The settler in packages/server/src/domain/chat/assembly/gather.ts reads any error from those two reads as empty, a database fault included.

## Why

A database fault during a greeting or an edit is hidden and the script runs over empty retrieval, where only a refused embedder or a missing vector space was meant to degrade.

## Done when

Degrade mode reads only an embedder refusal and a missing or unbuilt vector space as empty; any other error from the two reads fails the write as before, and a test plants each kind.

## Evidence

Filled at landing: what ran and where its output is.
