---
kind: bug
status: open
updated: 2026-10-30
priority: P2
area: ui
plan: css-system
---

# Reset every carried-scope variable in the seed palette blocks

## What

A carried ThemeScope emits variables beyond the tone roles, such as the chart ramp (--color-chart-\*), --color-input-border and --color-ring (D159). If a seed palette block nested inside a carried scope does not restate one of them, the nested seed paints the outer custom value. Item 1448 fixed this for the tone literals and mix knobs; the other THEME_SCOPE_EMIT_VARS were not checked.

## Why

A seed thumbnail or nested seed scope under a custom app theme must paint its own palette; a leaked edge or ring can break D159's bounds.

## Done when

Every THEME_SCOPE_EMIT_VARS member is either restated by each seed block or proven not to need it, and a CT asserts a nested seed paints its own value for each, Chromium and WebKit.

## Evidence

Filled at landing: what ran and where its output is.
