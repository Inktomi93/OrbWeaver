---
kind: bug
status: open
updated: 2026-11-14
priority: P2
area: automation
---

# Machine-written lore stored before the neutralizer fix holds no live brace run

## What

The neutralizer once left a live opener in a run of three braces. The write-time callers stored that output: the plugin lore write in `packages/server/src/domain/plugin/substrate/bridge.ts` and the analysis lore route in `packages/server/src/domain/automation/engine/analysis-make live.ts`, plus analysis lore cards stashed for confirm. A stored entry is evaluated at full power when it matches in a turn. The rows to look at are machine-written and unedited: a plugin entry prefix or an automation rule title whose action runs an analysis, a provenance hash that still matches, and a brace run of three or more. Only the owner's install exists.

## Why

A plugin or a model reply could have planted a macro that still runs on the host's turns, and the fix to the function does not reach text already stored.

## Done when

A scan of the owner's database reports how many such rows exist. If any do, a one-time step passes them through the neutralizer again and restamps the hash, leaving host-written and hand-edited rows alone. Stashed analysis lore is passed through the neutralizer again at confirm in `packages/server/src/domain/automation/engine/analysis-confirm.ts`.

## Evidence

Filled at landing: what ran and where its output is.
