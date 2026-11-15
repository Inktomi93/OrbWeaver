---
kind: bug
status: open
updated: 2026-11-15
priority: P1
area: import
---

# A preset that differs only by its regex scripts is deduped and its scripts attach to the other preset

## What

A SillyTavern folder with two presets whose prompts match but whose regex scripts differ previews as '1 the same as another in this upload'; the run creates one preset, and the second preset's own scripts attach to the first.

## Why

SillyTavern users keep preset variants that differ in their scripts; importing both leaves one preset silently running both script sets and loses the variant.

## Done when

The preset import's equality includes the regex script set; the preview counts such a preset as new; the run creates both presets, each with its own scripts attached.

## Evidence

Filled at landing: what ran and where its output is.
