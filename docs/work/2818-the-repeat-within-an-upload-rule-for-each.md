---
kind: work
status: open
updated: 2026-11-13
priority: P3
area: server
plan: import-robustness
---

# The repeat-within-an-upload rule for each import kind has one home with its write

## What

Each owning domain's read-only import check keeps a local set of what earlier entries in the same upload would land, beside the write that gets the same reuse by reading the database item by item. A test holds the two together; no shared function does.

## Why

Two statements of one rule drift, and the preview then misstates the run.

## Done when

For presets, personas, themes, world books and characters the preview and the write call one function for in-upload reuse, and the per-kind local sets are gone.

## Evidence

Filled at landing: what ran and where its output is.
