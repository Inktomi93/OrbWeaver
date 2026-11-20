---
kind: work
status: open
updated: 2026-11-20
priority: P3
area: ui
plan: cross-surface-consistency
---

# End-aligned button rows wrap at narrow widths

## What

A greeting preview button row overflowed at a narrow width with enlarged text because its Row did not set wrap, while the Row primitive offers it. Other end-justified button rows may carry the same omission.

## Why

Each one overflows only at narrow widths with enlarged text, where nobody looks until a check fails.

## Done when

A sweep finds every end-justified Row holding buttons, each wraps or states why it cannot, and the action-group checks cover the narrow enlarged width.

## Evidence

Filled at landing: what ran and where its output is.
