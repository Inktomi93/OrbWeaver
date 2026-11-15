---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: import
plan: import-robustness
---

# Preset import and regex roster polish from the combined rendered review

## What

Three findings. The import preview uses internal wording for the added prompts, a pattern error and the old display-only setting. At a short window the import dropzone keeps its full height after a file is picked, so only the first summary line shows with no scroll cue. In the on-screen roster a row whose tier or master switch is off shows an Off mark beside a switch that reads on, and a script off for its own reason shows only the tier's reason.

## Why

Each is a small confusion on the path a SillyTavern user takes first.

## Done when

The preview names each thing in the user's words. A picked dropzone collapses or shows a scroll cue at a short window. A roster row shows one state, and a script off for its own reason says so.

## Evidence

Filled at landing: what ran and where its output is.
