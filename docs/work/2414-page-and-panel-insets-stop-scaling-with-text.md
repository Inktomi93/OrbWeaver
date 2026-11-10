---
kind: bug
status: open
updated: 2026-11-10
priority: P3
area: ui
plan: cross-surface-consistency
---

# Page and panel insets stop scaling with text so a nested picker keeps room at 300%

## What

At 300% text on a 390px phone the settings page inset and the automation rule card's panel inset still scale with the root, leaving the rule card's connection slot narrow, so a picker value such as 'Same as my Image generation role' wraps to many lines even with the nested indent and picker chrome held.

## Why

Insets that grow with text eat the width enlarged text needs; the value reads as a tall narrow column.

## Done when

The page and panel insets are held with tokens the way --spacing-indent and --spacing-picker-inset hold theirs, unchanged at 100%, and the rule card picker value wraps to no more lines than the width physically requires at 300% on the phone profile, measured by a production-mounted CT.

## Evidence

Filled at landing: what ran and where its output is.
