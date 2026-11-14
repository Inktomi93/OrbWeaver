---
kind: bug
status: open
updated: 2026-11-14
priority: P1
area: import
plan: import-robustness
---

# Import a preset's bundled regex scripts with the preset

## What

The profile-folder import already lifts a preset's bundled regex scripts: `parsePresetExtensions` in `packages/server/src/domain/import/substrate/preset.ts` reads `extensions.regex_scripts`, and `packages/server/src/domain/import/verbs/import-presets.ts` attaches them through the injected `importPresetScripts` op (D53, D213). The single-file preset import does not: the Presets page dialog and `packages/server/src/domain/preset/verbs/import.ts` take the same file and drop the scripts with no message. Route the single-file door through the same parse and the same op, and list the scripts in its summary. Reported by a first user importing the public preset Sola V4 Flame Complete as one JSON file: SillyTavern draws styled panels in replies, and here the reply shows the raw tags.

## Why

A preset that draws its panels with bundled regex imports as prompts that emit tags with nothing to render them, and the summary says nothing.

## Done when

Importing the Sola V4 Flame Complete file through the Presets page attaches its scripts to the preset, the summary states how many came over and names any refused, and the single-file door and the folder door share one parse. A test pins it with a bundled-regex fixture through the single-file door.

## Evidence

Filled at landing: what ran and where its output is.
