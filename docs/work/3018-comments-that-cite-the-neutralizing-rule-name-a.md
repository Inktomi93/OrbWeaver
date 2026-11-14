---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: server
plan: checked-law
---

# Comments that cite the neutralizing rule name a law that exists

## What

Code comments cite a numbered law line for the rule that machine-written text is neutralized before it can reach a macro-evaluated slot, for example in `packages/server/src/domain/plugin/substrate/plugin-macros.ts` and `packages/server/src/domain/automation/engine/lore-write.ts`. No law file holds that rule, and the citation test does not resolve that spelling, so nothing fails.

## Why

A reader who follows the cite finds nothing, and the rule has no stated home to amend.

## Done when

The rule has one home in law or a decision record, each comment cites it in the grammar the citation test checks, and the test resolves every one.

## Evidence

Filled at landing: what ran and where its output is.
