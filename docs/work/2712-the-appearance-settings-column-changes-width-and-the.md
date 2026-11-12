---
kind: bug
status: open
updated: 2026-11-12
priority: P2
area: client
plan: cross-surface-consistency
---

# The appearance settings column changes width and the theme builder grows after readiness

## What

On Config appearance the sections lose width and shift sideways just after readiness, and the theme builder's first section gains height a moment later, on desktop and phone. The cause is not yet read in source. Measurements: the stability walk report under reports/cb-walk-stability.

## Why

Rows move under the pointer after the surface claims to be settled.

## Done when

The appearance sections and the theme builder hold their boxes from readiness on, shown by a component test on the production surfaces that is red today, at desktop and phone sizes.

## Evidence

Filled at landing: what ran and where its output is.
