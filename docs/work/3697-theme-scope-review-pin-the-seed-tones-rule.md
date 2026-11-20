---
kind: work
status: open
updated: 2026-11-20
priority: P3
area: ui
plan: test-foundation
---

# Theme scope review: pin the seed tones rule and stop restating the seed tables in tests

## What

Code review of the accent-only seed scope. Swapping the default knobs for the solved ones in packages/ui/src/content/theme-scope/tone-knobs.ts changes no test result, so the rule that other tones are judged as the seed paints them is unpinned. tests/ui/content/theme-scope/seed-palette.test.ts restates two lookup tables from packages/ui/src/content/theme-scope/seed-palette.ts. The title of a case in tests/ui/content/theme-scope/seed-accent.test.ts still claims a tint separation it no longer checks.

## Why

An unpinned rule can regress silently, and a restated table agrees with itself when production changes.

## Done when

A case goes red when tone-knobs uses the default knobs over a seed; the seed-palette test imports or derives its expected tables from production; the seed-accent title says what it checks.

## Evidence

Filled at landing: what ran and where its output is.
