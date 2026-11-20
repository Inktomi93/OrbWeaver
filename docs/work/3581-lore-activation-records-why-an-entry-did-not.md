---
kind: work
status: open
updated: 2026-11-20
priority: P2
area: chat
---

# Lore activation records why an entry did not fire

## What

The drop-reason union in `packages/contracts/src/chat/assemble.ts:289` has one member, `budget`. A disabled entry and a key miss are recorded nowhere (`packages/server/src/domain/chat/assembly/context.ts:319-327`), and the renderer prints only a count. Record a verdict per entry and show it in the prompt view. Copy the shape of `MEMORY_RECALL_VERDICTS` and `memory-recall-detail.tsx`.

## Why

An author whose entry did not fire cannot learn whether it was disabled, unmatched or over budget.

## Done when

Each lore entry carries a typed verdict through assembly to the prompt view. A new verdict fails `tsc` where the union is mapped.

## Evidence

Filled at landing: what ran and where its output is.
