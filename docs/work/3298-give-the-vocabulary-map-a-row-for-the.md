---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: docs
plan: cross-surface-consistency
---

# Give the vocabulary map a row for the preset prompt noun and the two history chips

## What

Users now see "prompt" while the code says `section` (`PRESET_SECTIONS_NAME = "Preset prompts"`, `PRESET_BACK_TO_RACK_NAME = "Back to prompts"`). That is the shown-word versus code-spelling split `docs/law/vocabulary-map.md` exists to record. The map does not contradict the new words today; it just does not rule them.

## Why

A noun the product shows under one word and the code spells under another drifts when no row rules it.

## Done when

A row for Prompt (shown) and `section` (code), plus the "Before chat history" and "After chat history" chips (shown) against `setup` and `post` (code).

## Evidence

Filled at landing: what ran and where its output is.
