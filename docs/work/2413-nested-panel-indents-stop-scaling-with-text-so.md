---
kind: bug
status: open
updated: 2026-11-10
priority: P3
area: ui
plan: cross-surface-consistency
---

# Nested panel indents stop scaling with text so a rule card badge stays inside its panel at 300%

## What

At 300% text on a phone a requirement badge on the automation rule card sits a few pixels past its panel: the nested indent, the badge padding and its glyph all scale with the root. The rule card CT holds badges inside the panel at 200% only.

## Why

A badge clipped by its panel loses part of its text at the largest text step.

## Done when

Nested panel indents are held with a token the way --spacing-picker-inset holds the picker chrome, every requirement badge ends inside the panel at 300% on the phone profile, and the rule card CT asserts it at 300%.

## Evidence

Filled at landing: what ran and where its output is.
