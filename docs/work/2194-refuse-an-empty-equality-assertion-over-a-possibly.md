---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: tests
plan: test-enforcement
---

# Refuse an empty-equality assertion over a possibly empty filter

## What

The empty-population lint restrictions in `eslint.config.ts` cover `every` and `some` only. An assertion that a filtered list is empty passes when the source list is empty too. The tree already holds that shape across the test packages, never behind a non-empty check, and many of those sources are empty on purpose, so each site needs a judgment: prove the population first, or replace the assertion with a positive control. Sweep the sites package by package, then turn the restriction on.

## Why

The assertion passes vacuously when the recorder never captured anything.

## Done when

Every site either proves its source list non-empty or asserts a positive control, the restriction is on with no baseline or suppression, a plant row is refused, and ESLint over the tests is clean.

## Evidence

Filled at landing: what ran and where its output is.
