---
kind: work
status: open
updated: 2026-10-30
priority: P2
area: ui
plan: test-foundation
---

# Build the theme emit-surface drift check, per-palette contrast sweep and partition pairing test

## What

UI-Theming-and-Content §12.1 relies on three checks that do not exist: an emit-surface drift check (THEME_SCOPE_EMIT_VARS against what ThemeScope actually emits), a per-palette contrast sweep over every intent and surface pairing in each shipped theme, and a --color-\* partition pairing test. The appearance message-style section CT (schematic geometry, palette readability, picker behavior) is also missing. Each has an unreviewed restoration register entry.

## Why

Theme contrast and the emitted token surface are product guarantees with no running check.

## Done when

Each check runs production code (tokens.build.ts output, ThemeScope, the appearance section) at the layer Spine-Testing §10 assigns, shown red against a planted defect; the restoration register records the decisions; UI-Theming-and-Content cites the live checks.

## Evidence

Filled at landing: what ran and where its output is.
