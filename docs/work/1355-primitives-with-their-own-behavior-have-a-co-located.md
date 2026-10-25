---
kind: work
status: open
updated: 2026-10-25
priority: P2
area: ui
plan: test-foundation
---

# Primitives with their own behavior have a co-located CT

## What

A ui primitive needs its own CT only where its seal adds behavior no feature CT pins (`UI-Primitives-and-Reuse.md` §13.7). Candidates: color-field, combobox chips, macro-textarea, file-dropzone, sortable, the table sort button, reveal-gate, the textarea autosize fallback, virtual-list, message-list, media-grid, and any state a feature cannot reach (disabled reason, error, coarse-pointer touch floor). Several already have one.

## Why

The test-foundation plan picks cases by risk and distinct behavior, not per-file quotas. A plain Base UI wrap is exercised by every feature surface that mounts it; a CT for it repeats Base UI's own tests.

## Done when

Each candidate is compared against its feature coverage and gets a keep, rebuild or drop decision in this item; each kept primitive CT mounts the primitive under `CtIsolation` and covers the R7 shapes that apply to it; no CT is added for a primitive whose behavior feature CTs already pin.

## Evidence

Filled at landing: what ran and where its output is.
