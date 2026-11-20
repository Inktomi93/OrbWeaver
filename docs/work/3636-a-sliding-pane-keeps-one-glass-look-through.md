---
kind: bug
status: open
updated: 2026-11-20
priority: P3
area: ui
plan: cross-surface-consistency
---

# A sliding pane keeps one glass look through its whole motion

## What

Collapsing a shell pane turns its backdrop blur off on the first frame of the slide, while opening blurs a moving pane; motion guide §3.7 forbids a live blur on a moving element, so the open path breaks the rule and the close path changes the look before the motion ends.

## Why

The pane's look jumps at the start of a close, and the open slide paints a live blur.

## Done when

Open and close treat glass the same under §3.7, checked per frame by a component test.

## Evidence

Filled at landing: what ran and where its output is.
