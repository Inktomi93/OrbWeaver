---
kind: bug
status: open
updated: 2026-11-20
priority: P2
area: stats
---

# The embedding and compaction spend sentence is true in the app

## What

`analytics-copy.ts:22-23` says a backup does not preserve embedding or compaction spend history. `spend` is a whole-library portable kind (`packages/contracts/src/portability/index.ts:55-57,111`), and compaction passes land in it (`packages/db/src/schema/stats.ts`). Correct the sentence. The same sentence sits in two wiki pages, covered by the wiki bundle.

## Why

The app tells a user their spend history is lost on restore when it travels with the export.

## Done when

The copy states what the export keeps, matching the portable kinds.

## Evidence

Filled at landing: what ran and where its output is.
