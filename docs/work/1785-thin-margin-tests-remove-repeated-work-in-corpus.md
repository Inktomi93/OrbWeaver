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

These tests run close to their time budget under load. The owner rule is to remove repeated work and never raise a timeout.

## Done when

Each of the three finishes well inside its budget in a whole-suite run, and none repeats setup that another case in the same file already does.

## Evidence

Filled at landing: what ran and where its output is.
