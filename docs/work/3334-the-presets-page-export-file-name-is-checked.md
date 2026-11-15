---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: preset
plan: import-robustness
---

# The Presets page export file name is checked for accented, non-Latin and all-symbol preset names

## What

The download name for an exported preset now comes from the server's handle slug. The name changes for accented, non-Latin and all-symbol preset names.

## Why

A reader who exports a preset named in their own language should get a file name they recognise.

## Done when

A rendered check exports presets with an accented name, a non-Latin name and an all-symbol name, and each file name is readable and distinct; a fix is filed or made if one is not.

## Evidence

Filled at landing: what ran and where its output is.
