---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: server
plan: checked-law
---

# Three domain file headers agree with their law

## What

The headers of `packages/server/src/domain/import/substrate/card.ts` and `packages/server/src/domain/import/verbs/restore-character-book.ts` describe the whole-file hash as the duplicate check, against D290 and against the code. The header of `packages/server/src/domain/embeddings/verbs/write-hub-scores.ts` says it is the only update outside the store, against the handoff restamp exception in Knowledge-Cluster invariant 1.

## Why

A file header is the home of per-domain law, so a cold author who reads it follows the rejected rule.

## Done when

Each header agrees with D290 or with the Knowledge-Cluster invariant, confirmed against the code, or the law is amended in the same commit with the reason.

## Evidence

Filled at landing: what ran and where its output is.
