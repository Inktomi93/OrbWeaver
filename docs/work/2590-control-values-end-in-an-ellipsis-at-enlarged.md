---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
plan: surface-walk
---

# Control values end in an ellipsis at enlarged text across Config, corpus, presets, refinery and chat rooms

## What

A Select trigger's value wraps between its words and the trigger grows from the control height floor, as a sized Button does. The swatch name, Looks labels, result chips and preset readout wrap the same way. The regex Stream and Macros buttons stay with their own item.

## Why

The reader chose the control for the text the ellipsis hides, and law allows a cut only for a chrome title that opens its whole text.

## Done when

a component test per surface family shows the whole value at default and enlarged text, and the enlarged-text walk lists no value-cut finding on those surfaces.

## Evidence

Filled at landing: what ran and where its output is.
