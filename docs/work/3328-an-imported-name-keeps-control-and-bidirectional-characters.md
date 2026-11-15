---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: import
plan: import-robustness
---

# An imported name keeps control and bidirectional characters

## What

`clipImportText` (packages/contracts/src/import/preview\.ts) clips a file's name and makes it well formed, nothing else. Code-reviewer probe: a regex script named with U+202E, a newline and BEL reached `refusedScripts` in the preview and in the run outcome intact. Markup is inert when the dialog renders text, but a right-to-left override still reorders what the owner reads. Every imported name goes through the same function (`.claude/rules/import.md`), so the gap covers every name, not only script names.

## Why

An owner can be shown a name that reads differently from what it is.

## Done when

Every name an import shows has its control characters and bidirectional overrides removed or made visible at one place, and a case through one door reads a cleaned name; ux-reviewer judges the rendering.

## Evidence

Filled at landing: what ran and where its output is.
