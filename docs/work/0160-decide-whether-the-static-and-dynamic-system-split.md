---
kind: work
status: open
updated: 2026-09-24
priority: P2
area: chat
---

# Decide whether the static and dynamic system split earns its keep

## What

Investigate whether the static and dynamic split of the system prompt does real work, then delete it or shrink it to the part that does. The split lives in isSectionDynamic (packages/server/src/domain/chat/assembly/assemble.ts:691) and the static and dynamic halves it feeds. Answer each question with evidence:

- Ordering: does the split ever produce a better order than the user's drag order, or does it only move trigger-gated, Memory, Databank and Guided sections out of place?
- Cache: using the live run from item 0158, does the breakpoint after the static half save hits that one breakpoint at the end of the whole system prompt would miss?
- Consumers: do the volatile-macro cache-buster scan, the budget slices, the agent-sdk join, splitSystem and the thinking prefix binding need two halves?

If nothing needs it, delete the split, its trace fields and its tests. Send the system prompt in drag order, and warn in the preset editor when per-turn content sits above Chat History. If a part earns its keep, keep only that part and show it in the preset manager.

## Why

SillyTavern and Marinara send the system prompt in the user's order, with one optional breakpoint on its last block. The owner wants assembly to follow the user's arrangement and to avoid hidden optimization. The split may be a leftover that silently reorders sections, against ADR 0251.

## Done when

The item records the answer to each question with evidence. The split is deleted or reduced, a test shows sections arrive in drag order, and the item 0161 cache settings place their breakpoints on the result.

## Evidence

Filled at landing: what ran and where its output is.
