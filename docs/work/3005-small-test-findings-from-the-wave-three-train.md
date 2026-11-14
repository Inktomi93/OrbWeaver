---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: tests
---

# Small test findings from the wave three train review

## What

Four test findings. memory-strikes-fork.int.test.ts gives the struck block and the block straddling the floor the same anchor text, so the case tells them apart only by strike count. memory-strikes-orphan-arc.int.test.ts plants its state with a raw delete instead of a sanctioned historic-state factory. memory-strikes-restore.int.test.ts and memory-strikes.int.test.ts hold second copies of the redigest and strike-a-scoped-copy helpers. character-refusal-notice.ts spells its fallback reason twice and the toast gives only the first failed card's reason.

## Why

Each weakens what a case proves or keeps two homes for one helper.

## Done when

Each of the four is fixed, with the helpers in one home and distinct anchors in the fork case.

## Evidence

Filled at landing: what ran and where its output is.
