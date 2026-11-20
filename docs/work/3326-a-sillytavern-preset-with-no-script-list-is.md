---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: server
plan: import-robustness
---

# A SillyTavern preset with no script list is compared as a preset with no scripts

## What

`readPresetFile` (packages/server/src/domain/preset/verbs/import-file.ts) and `presetImportFile` (packages/server/src/domain/import/substrate/landing-bytes.ts) always hand `regexScripts`, `[]` when the file has no `extensions.regex_scripts`, so the preset identity compares the file's empty list with the library preset's attachments. Code-reviewer probe: import a SillyTavern preset with no `extensions`, attach one library script to it by hand, import the same file again: the preview says `inLibrary: false` and the run creates "D 2". An orbweaver file (`{ bytes }` alone) compares on config alone and reuses.

## Why

The rule says a file with no script list compares on config alone; a SillyTavern file without the list breaks it and doubles the preset.

## Done when

Both doors hand `regexScripts` only when the file carries a script list. The probe's second import reuses the preset, in the Presets preview, its run and the folder, red on the old code.

## Evidence

Filled at landing: what ran and where its output is.
