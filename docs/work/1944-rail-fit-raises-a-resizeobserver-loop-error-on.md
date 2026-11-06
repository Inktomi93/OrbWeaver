---
kind: bug
status: open
updated: 2026-11-06
priority: P3
area: client
plan: cross-surface-consistency
---

# Rail fit raises a ResizeObserver loop error on boot

## What

use-rail-sections-fit.ts and the scroll-area fade observer raise a ResizeObserver loop error on boot at phone landscape sizes. New with the rail fit.

## Why

It brings back the class content-growth.ts removed, though nothing shows on screen.

## Done when

No loop error on boot at 844x340, 844x430 and 932x430.

## Evidence

Filled at landing: what ran and where its output is.
