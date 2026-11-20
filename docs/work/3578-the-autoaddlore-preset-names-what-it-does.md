---
kind: bug
status: open
updated: 2026-11-20
priority: P2
area: automation
---

# The autoAddLore preset names what it does

## What

The autoAddLore preset's name and summary say it writes what has happened. It writes a template whose default text is `Session notes.`, and the real `distillLore` sits beside it under a near-identical name (`packages/server/src/domain/automation/contract/presets.ts:387-390,409`). Rename the preset to say it appends session notes to lore, or remove it.

## Why

A user choosing between the two presets cannot tell which one summarizes the story, so the wrong one gets enabled.

## Done when

The preset's name and summary describe the template it writes, or the preset is gone. A case reads the shipped preset list and finds no two names a reader could confuse.

## Evidence

Filled at landing: what ran and where its output is.
