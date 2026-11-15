---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: client
plan: import-robustness
---

# The Presets page import result does not name a script it stored switched off

## What

`PresetImportOutcome` (packages/contracts/src/preset/portability.ts) carries `regexScripts.refused` only, and the landed toast (`importedSentence` in packages/client/src/features/preset/hooks/use-preset-list-header.tsx) prints counts and names no refused script either. A script the lift stored switched off (no target, no pass that reads its target, a pattern that does not compile) is named in the preview's `leftOut`, the folder report, the card notes and the Regex page notes, but not in the Presets page's own result. The dialog shows the preview first, so it is visible before the run.

## Why

The run's result should say what the run did, as every other door's does.

## Done when

The run outcome carries the same notes as the preview, and the dialog or toast shows them and the refused scripts; ux-reviewer judges the copy. A case through `preset.importFile` reads the notes, and `pnpm snap` shows the landed state.

## Evidence

Filled at landing: what ran and where its output is.
