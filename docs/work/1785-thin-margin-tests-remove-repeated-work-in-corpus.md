---
kind: bug
status: open
updated: 2026-11-06
priority: P3
area: tests
plan: test-foundation
---

# Thin-margin tests: remove repeated work in corpus-image-variants, the imageBeforeTool completion case and the theme accent sweep

## What

Remove repeated work from the corpus-image-variants tests, the imageBeforeTool completion case and the theme accent sweep.

## Why

These tests run close to their time budget under load. The owner rule is to remove repeated work and never raise a timeout. One run at moderate load measured the corpus image variants test at about three seconds against the five second `testTimeout` budget in `vitest.config.ts`, and the two `imageBeforeTool` completion cases at one to two seconds each. The theme accent sweep test was not located by name; find it first.

## Done when

The corpus image variants test and the theme accent sweep each finish well inside their budget in a whole-suite run, and none repeats setup that another case in the same file already does. The `imageBeforeTool` cases stay unless a whole-suite run shows them near budget.

## Evidence

Filled at landing: what ran and where its output is.
