---
kind: work
status: open
updated: 2026-11-06
priority: P3
area: client
plan: cross-surface-consistency
---

# Form seed builders derive from the procedure input (Omit of the view by the input's keys), so a widened view cannot ride an upcast into a strict input

## What

Find the form seed builders (the functions that build a form initial value from a server view) and type each from the procedure input: the view type minus the keys the input names. Candidates to check first: `scheduleFormValuesFromRow` in `packages/client/src/features/workloads/lib/workloads-schedule-model.ts`, `draftFromValues` in `packages/client/src/features/config/components/appearance-looks-section.tsx` and `makeRegexScriptDefaults` in `packages/client/src/features/regex/hooks/use-regex-script-form.ts`. A builder that never feeds a strict input stays as it is.

## Why

A seed builder typed by the view lets a field added to the view reach a strict procedure input through an upcast, with no compile error. No function in packages/client is named a seed builder, so the first step is the list of builders that really feed a strict input.

## Done when

The list of builders that feed a strict input is written in the Evidence. Each takes its type from the procedure input, and adding a view field that the input rejects makes the typecheck fail, with a planted case.

## Evidence

Filled at landing: what ran and where its output is.
