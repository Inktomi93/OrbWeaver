---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: client
plan: cross-surface-consistency
---

# The import preview puts Cancel before its primary like the dialog footers

## What

The import preflight in `packages/client/src/features/workloads/components/import-library-section.tsx` shows Import then Cancel, start-aligned, while every dialog footer shows Cancel then the submit, end-aligned. The order has no owner an inline card can reach: `FormDialog` and `FlowDialog` in `packages/client/src/components/form-dialog.tsx` own it for dialogs only, and the plan keeps the preflight an island, not a dialog. Extract the commit row from the dialog composites into one shared owner that fixes the order and the Cancel variant, and draw the preflight's row through it, end-aligned.

## Why

A reversed button order trains the wrong reach for the destructive or primary action.

## Done when

The dialog composites and the import preflight draw their Cancel and submit through one commit-row owner, the preflight reads Cancel then Import, and a CT reads the order on the preflight and on one dialog.

## Evidence

Filled at landing: what ran and where its output is.
