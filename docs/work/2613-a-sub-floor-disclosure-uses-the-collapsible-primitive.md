---
kind: tooling
status: open
updated: 2026-11-12
priority: P3
area: tooling
plan: checked-law
---

# A sub-floor disclosure uses the collapsible primitive

## What

A lint rule that refuses a hand-built disclosure below the collapsible primitive's floor. The sites whose comments claimed the checker are listed under M3 in the missing-checker list under reports/law-census.

## Why

The disclosure ruling lost its rule, so a hand-built toggle can return unreported.

## Done when

The rule runs at zero, its planted test fails on a hand-built toggle, and the sites cite it.

## Evidence

Filled at landing: what ran and where its output is.
