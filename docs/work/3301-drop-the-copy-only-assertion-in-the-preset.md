---
kind: tooling
status: open
updated: 2026-11-15
priority: P3
area: tooling
plan: test-foundation
---

# Drop the copy-only assertion in the preset import door CT

## What

tests/client/features/preset/hooks/preset-import-door.ct.tsx (on its branch) asserts that `PRESET_IMPORT_DROPPED_HEADING` is visible: a heading's text, with no state behind it. The region assertion on the next line already proves the list is there.

## Why

A copy-only assertion fails on a reword and proves no behavior.

## Done when

The heading assertion is removed and the region assertion stays.

## Evidence

Filled at landing: what ran and where its output is.
