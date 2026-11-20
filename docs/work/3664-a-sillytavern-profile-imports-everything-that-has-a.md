---
kind: work
status: open
updated: 2026-11-20
priority: P2
area: import
plan: import-robustness
---

# A SillyTavern profile imports everything that has a home here

## What

Inventory every kind of data a SillyTavern profile holds (characters, chats, group chats, personas, world info, presets of every API, instruct and context templates, system prompts, regex scripts at every scope, quick replies, databank and attachments, backgrounds, themes, user settings, extension data) against what the SillyTavern import takes today, and list every kind it skips or flags as not importable. For each skipped kind that has an applicable system here, build the import through the same staged tree, preview and report. Where no sample exists on this box, run the SillyTavern checkout at ~/inktomi-stack/SillyTavern under a throwaway user to produce one, or read its source to derive the format, and say which was used.

## Why

A user moving from SillyTavern should arrive with everything this app can hold, not a subset they have to rebuild by hand.

## Done when

The inventory is recorded with each kind's disposition (imported, imported with a stated loss, or no home here with the reason), every kind with a home imports through the real import door with a test over a real-shaped sample, and the import report names each skipped kind and why.

## Evidence

Filled at landing: what ran and where its output is.
