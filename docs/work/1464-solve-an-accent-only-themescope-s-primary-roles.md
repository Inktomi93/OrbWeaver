---
kind: work
status: open
updated: 2026-10-30
priority: P3
area: ui
plan: css-system
---

# Solve an accent-only ThemeScope's primary roles against a carried ambient palette

## What

An accent-only ThemeScope (a character accent with no background) nested inside a custom app theme takes the primary role mix at the outer scope's knobs, so its primary roles are not judged against the D336 floors. Solving them needs the scope to know whether its ambient palette is carried. Found while building item 1448.

## Why

D336 promises every role clears its floor under a custom theme; a nested character accent is the gap.

## Done when

An accent-only scope inside a carried app theme emits literal primary roles that clear every D336 floor, pinned by a clamp test over the accepted bases.

## Evidence

Filled at landing: what ran and where its output is.
