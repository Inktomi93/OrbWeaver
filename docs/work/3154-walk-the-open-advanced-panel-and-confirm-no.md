---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: ui
plan: cross-surface-consistency
---

# Walk the open Advanced panel and confirm no hint-trigger finding

## What

The preset editor's open Advanced panel should list no finding for the Word bias hint trigger in the surface walk. `tests/client/features/preset/components/preset-advanced-reach.ct.tsx` shows the trigger inside the panel at 100% and 200%, but no walk has run since the fold clip landed.

## Why

The walk is the clause's named evidence, and a CT over one panel does not show what the walk's checkpoints report.

## Done when

A surface walk that opens the Advanced panel lists no finding for the Word bias trigger, and the run id is recorded on the board item that asks for it.

## Evidence

Filled at landing: what ran and where its output is.
