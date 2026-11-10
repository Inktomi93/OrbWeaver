---
kind: bug
status: doing
updated: 2026-11-10
priority: P3
area: tooling
lane: wt/agent-a1d7669296456e436
plan: cross-surface-consistency
---

# The text backdrop pixel ring stops at a sibling art box

## What

textBackdropRing samples past a label's box into the colour swatch beside it, so legible theme-menu labels in the Look tab are withheld instead of judged.

## Why

A withheld label is unjudged contrast; the ring must read the label's own ground.

## Done when

The ring excludes sibling art boxes and the theme-menu labels are judged, with a fixture of a label beside a swatch and a control where art truly sits under the label.

## Evidence

Filled at landing: what ran and where its output is.
