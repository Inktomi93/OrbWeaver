---
kind: tooling
status: open
updated: 2026-11-01
priority: P3
plan: surface-walk
area: tooling
---

# Design audit RESULT line quotes a multi-word theme name instead of splitting it into tokens

## What

The design audit's RESULT line quotes a theme name that contains spaces, instead of splitting it into tokens.

## Why

`themePairs` in `tooling/src/snap/lib/design-audit-report.ts` prints "Pale paper" as `theme-request=Pale`, so the line misreports the theme.

## Done when

A run with a multi-word theme name prints the whole name in one token, covered by a test.

## Evidence

Filled at landing: what ran and where its output is.
