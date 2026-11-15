---
kind: decision
status: open
updated: 2026-11-15
priority: P3
area: docs
---

# The density law's CONTEXT viewport row and its owner disagree on the gap between blocks

## What

The CONTEXT panel viewport row of the surface table in docs/law/UI-Density-Law\.md gives a between-blocks gap of gap-row. ContextTabBody, which the same section now names as the owner, spaces its sections kind at the section step and its blocks kind at the block step, and the sections kind did so before this owner gained its other kinds.

## Why

The law names an owner whose numbers it contradicts, so a cold author cannot tell which one to fix.

## Done when

The row states the gaps the owner's kinds draw, or the owner draws what the row says, with the reason in the law.

## Evidence

Filled at landing: what ran and where its output is.
