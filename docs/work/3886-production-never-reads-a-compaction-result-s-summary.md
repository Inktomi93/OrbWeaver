---
kind: work
status: open
updated: 2026-11-22
priority: P3
area: server
plan: unwired-code
---

# Production never reads a compaction result's summary when the result did not update

## What

`CompactResult` (packages/server/src/domain/chat/contract/results.ts) carries `summary` in both union members. The engine reads it only after narrowing on `res.updated` (packages/server/src/domain/chat/engine/engine.ts), so the `updated: false` member's `summary` is read only by tests. Found by the bloodhound member-roles pass.

## Why

Owner ruling: a field only tests read is not kept for the tests; find why production never reads it.

## Done when

Either a production reader of the not-updated summary exists with its reason, or that member drops the field and its tests read the production source.

## Evidence

Filled at landing: what ran and where its output is.
