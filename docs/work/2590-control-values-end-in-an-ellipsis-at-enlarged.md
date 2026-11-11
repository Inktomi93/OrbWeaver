---
kind: bug
status: open
updated: 2026-11-11
priority: P3
area: client
plan: surface-walk
---

# Control values end in an ellipsis at enlarged text across Config, corpus, presets, refinery and chat rooms

## What

Buttons, pickers and labels cut their own value with an ellipsis (kinds K2, K5, K6, K7), outside the regex buttons the regex sideways item owns. Evidence: the enlarged-text verdict table under reports/cb-walk-text.

## Why

The reader chose the control for the text it hides.

## Done when

Each value wraps or the control widens, a component test per surface family shows the whole value at both sizes, and the walk lists no value-cut finding there.

## Evidence

Filled at landing: what ran and where its output is.
