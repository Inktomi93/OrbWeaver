---
kind: bug
status: open
updated: 2026-11-20
priority: P2
area: client
plan: test-foundation
---

# theme-css-warnings test fails on an appearance-attribute rename row with no see

## What

tests/client/features/config/lib/theme-css-warnings.test.ts fails on main on the first appearance-attribute rename row, which carries no see field. The rename table lives in packages/client/src/owner-css/renames.ts.

## Why

A red test on main teaches lanes to ignore reds.

## Done when

The rename row carries its see target or the test's rule is corrected with the reason, and the test passes on main.

## Evidence

Filled at landing: what ran and where its output is.
