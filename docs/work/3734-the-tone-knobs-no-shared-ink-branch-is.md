---
kind: bug
status: open
updated: 2026-11-21
priority: P3
area: themes
plan: cross-surface-consistency
---

# The tone knobs' no-shared-ink branch is closed by a type or a sweep case

## What

packages/ui/src/content/theme-scope/tone-knobs.ts keeps a live no-shared-ink branch with no reporter and no test; two sweeps never saw it fire, and ADR 0338 records that sampled result as a ruling.

## Why

A branch no one can see fire is either dead or untested.

## Done when

The branch is deleted so a type closes it, or a sweep case asserts it never fires, and ADR 0338 states which.

## Evidence

Filled at landing: what ran and where its output is.
