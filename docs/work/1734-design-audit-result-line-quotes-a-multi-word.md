---
kind: tooling
status: doing
updated: 2026-11-27
priority: P3
area: tooling
lane: wt/agent-a8a76b60ece6b02c7
plan: surface-walk
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
