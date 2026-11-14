---
kind: bug
status: open
updated: 2026-11-14
priority: P2
area: tests
plan: cross-surface-consistency
---

# Find why the presets band case on a phone reached the last font-scale step on the hosted runner

## What

platform-topbar-overflow\.suite.ct.tsx, the presets band on a phone, failed on the hosted runner with the panel at no height: the ladder reached the scale where topbar and rail fill the 844 px screen. It passes on the tip pinned to two cores with two workers (two runs) and under a sixfold CPU throttle (one run). Suspected cause: enlargeUntilVisible in tests/support/browser/root-property.ts reads the trigger right after each style write, before the band's measured commit, and so may step past the step that folds the band. The other candidate is a font metric on the hosted image that needs a larger step. Neither reproduces here.

## Why

A case that walks the ladder past the scale it means to test fails on a slow host with nothing wrong in the product.

## Done when

The failure reproduces (the CI trace, or the hosted image's fonts locally) and the cause is named; if it is the read order, the helper waits for each step's measured commit before it reads, red first against the reproduction.

## Evidence

Filled at landing: what ran and where its output is.
