---
kind: bug
status: open
updated: 2026-11-16
priority: P3
area: chat
plan: chat-html-and-presets
---

# The plain-content notice's control does not focus the setting it names

## What

The notice's control opens the right pane and leaves focus on the pane's landmark. The setting the notice names gets no focus and no highlight, and the Trust tab's label is clipped to one letter when the context tab strip overflows.

## Why

A keyboard or screen reader user has to hunt for the setting the notice sent them to.

## Done when

After the control, focus is on the named setting and it is in view, and the Trust tab label is readable when the strip overflows. A component test asserts the focused control.

## Evidence

Filled at landing: what ran and where its output is.
