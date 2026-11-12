---
kind: bug
status: open
updated: 2026-11-12
priority: P2
area: client
plan: surface-walk
---

# The corpus insights finder list has no height at the largest phone text

## What

On a phone at the largest text the corpus insights finder's list scroller measures no height over its content and stays hidden, so the walk's corpus rail case stops there and the corpus labels and insights sites after it go unmeasured. An earlier tree gave that scroller a short height; it now gets none. The cause is not yet found in source. Evidence: the phone rerun reports under reports/cb-walk-text.

## Why

The finder list cannot be reached at that text size, and it hides every corpus site the walk would measure after it.

## Done when

The finder's list scroller exists with a usable height at phone width and the largest text, shown by a component test on the production surface that is red today, and the walk's corpus rail case measures past it.

## Evidence

Filled at landing: what ran and where its output is.
