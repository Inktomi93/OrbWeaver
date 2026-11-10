---
kind: bug
status: open
updated: 2026-11-10
priority: P2
area: ui
plan: cross-surface-consistency
---

# Select trigger chrome stops scaling with text at 300% so the value keeps a column

## What

At 300% text on a phone the Select trigger's padding, chevron and gap scale with the root and take most of the trigger, so the rule card picker's value column is a couple of pixels wide and its text stacks one or two letters per line, and the Model roles Chat picker grows to a tall column of letter fragments. The cb-big ux-reviewer report under reports/ux-reviewer has the captures.

## Why

A value that reads two letters a line is unusable; enlarged text should grow the value, not the chrome around it.

## Done when

At 300% on the phone profile every Select trigger in Model roles and the rule card gives its value at least the title floor (--width-title-floor) or a line of its own, with the trigger chrome held to the touch floor, proven by a production-mounted CT through the enlarged-text probe.

## Evidence

Filled at landing: what ran and where its output is.
