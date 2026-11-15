---
kind: work
status: open
updated: 2026-11-15
priority: P1
area: import
plan: import-robustness
---

# A backup keeps a preset's attached regex scripts

## What

A backup file carries each regex script with its global switch only (`packages/contracts/src/regex/schemas.ts`, `PortableRegexScript`), and the backup's preset file carries no scripts. Restoring a backup brings the scripts back into the library but attaches none to their preset. Add the preset's scripts to the backup's preset envelope in the card-wire shape, write them from the export descriptor, lift them in `createImportPresets` through the injected `importPresetScripts`, read a file without the field as today, and have the client's single preset export use the same server read.

## Why

An owner who backs up and restores loses every preset panel that a display script draws, with no warning.

## Done when

Export a preset with attached scripts through the backup door and through the Presets page export, import each into an empty library: the scripts are attached to the preset in their order and run at their passes. A backup written before the change imports as it does today.

## Evidence

Filled at landing: what ran and where its output is.
