---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: import
plan: cross-surface-consistency
---

# An empty SillyTavern preset previews as a valid preset of only added prompts

## What

`{"prompts":[],"prompt_order":[]}` previews as a valid SillyTavern preset with 4 prompts, all of them added slots (reviewer probe `BARE`). An empty file might deserve a refusal instead. Outside this lane, for the import-line review.

## Why

A file that holds nothing of its own lands as a preset of orbweaver's slots, which reads as a successful import of the person's preset.

## Done when

An empty prompt list is refused with a sentence, or the preview says the file holds no prompts of its own.

## Evidence

Filled at landing: what ran and where its output is.
