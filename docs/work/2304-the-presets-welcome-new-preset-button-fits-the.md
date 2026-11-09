---
kind: bug
status: open
updated: 2026-11-09
priority: P3
area: client
plan: cross-surface-consistency
---

# The Presets welcome New preset button fits the phone pane at 300% text

## What

In platform-text-scale, the case Presets welcome at 300% layout on the phone fails: the New preset button overflows its pane and the pane scrolls 32px sideways. It fails the same way on main at da4eaf565e, before the names merge.

## Why

Enlarged text that pushes a primary action past the pane breaks reflow on the phone.

## Done when

The New preset button wraps or shrinks inside the phone pane at 300% text, and the platform-text-scale Presets welcome case passes.

## Evidence

Filled at landing: what ran and where its output is.
