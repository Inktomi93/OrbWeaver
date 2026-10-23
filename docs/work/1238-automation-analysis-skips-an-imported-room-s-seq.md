---
kind: bug
status: open
updated: 2026-10-23
priority: P2
area: automation
---

# Automation analysis skips an imported room's seq-0 row

## What

`packages/server/src/domain/automation/engine/analysis-arm.ts` (around lines 436-438) treats a `settledThroughSeq` of 0 as no watermark and reads canon with `afterSeq: settledThroughSeq`, so a cold analysis pass over a room imported with 0-based numbering never reads its first row. Same sentinel-zero pattern item 1236 removed from the chat readers through `isCoveredByCompaction`.

## Why

Launched 0-based imports lose their opening line from automation analysis.

## Done when

No watermark is `null`, never 0; a cold pass over a room whose canon starts at seq 0 reads that row, asserted through the production root.

## Evidence

Filled at landing: what ran and where its output is.
