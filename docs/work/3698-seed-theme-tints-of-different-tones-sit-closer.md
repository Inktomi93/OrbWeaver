---
kind: bug
status: open
updated: 2026-11-20
priority: P3
area: theming
plan: cross-surface-consistency
---

# Seed theme tints of different tones sit closer than D338 allows

## What

D338 says tints of different tones stay apart. The shipped seeds break it: success and info, and warning and success on Light, sit too close, which the code review's pairwise probe over every seed shows. The seed matrix in tests/ui/content/theme-scope/ turns the pairwise check off for that reason.

## Why

Two status tones that read alike tell the user nothing, and the law states a rule the product breaks.

## Done when

Each seed's status tints meet D338's separation, retuned under D71, and the seed matrix runs with the pairwise check on; or D338 is amended with the measured reason.

## Evidence

Filled at landing: what ran and where its output is.
