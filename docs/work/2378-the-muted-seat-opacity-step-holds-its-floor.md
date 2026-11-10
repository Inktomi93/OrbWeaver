---
kind: work
status: open
updated: 2026-11-10
priority: P3
area: ui
plan: cross-surface-consistency
---

# The muted-seat opacity step holds its floor in every shipped theme

## What

opacity.muted-seat (77%) was sized on the default theme's weakest avatar pigment. A seed or custom theme with a lighter or darker primary moves that pigment.

## Why

A floor sized on one theme can fail on another.

## Done when

The chat-character-bar CT measures the muted seat's initials in every seed theme and passes, or the step is raised to the lowest value that holds across them.

## Evidence

Filled at landing: what ran and where its output is.
