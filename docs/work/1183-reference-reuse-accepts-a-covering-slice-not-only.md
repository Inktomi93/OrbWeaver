---
kind: bug
status: doing
updated: 2026-10-21
priority: P1
lane: codex/reference-demand-1183
plan: test-foundation
---

# Reference reuse accepts a covering slice, not only an identical demand

## What

coversReferenceDemand (floor/code-facts/semantic-inventory.ts:725-726) reuses stored references only when the demanded query list is exactly equal, so any different slice rebuilds the whole world; referenceMode defaults to complete although a closed mode exists.

## Why

A store that rebuilds on any new slice gives no reuse to the next caller.

## Done when

Reuse succeeds when stored references cover the demanded slice, extraction defaults to the demanded closed slice, and a test shows a narrower second demand reuses without a worker.

## Evidence

Filled at landing: what ran and where its output is.

Priority evidence from 1179: in the root world, test-root declarations produce 8.05M reference rows that no verb reads. Demand-keyed references are now the main cost lever for scoped verbs.
