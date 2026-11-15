---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: chat
---

# A focus grab from one frame into another loses no key before it is refused

## What

The per-frame focus check sees a move from one sandboxed frame to another up to one animation frame late. While a reader types in one reply frame, another frame that calls focus on a loop takes the key in flight on each grab before it is refused and stopped. D294 states the cost.

## Why

A reader loses a key or two and their place; the grabbing frame never keeps the keys it took past its stop.

## Done when

A frame-to-frame grab is refused before the next key lands, or D294 names the window, and the two-frame loop case asserts the bound.

## Evidence

Filled at landing: what ran and where its output is.
