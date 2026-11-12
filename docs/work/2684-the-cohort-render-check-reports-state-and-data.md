---
kind: tooling
status: open
updated: 2026-11-12
priority: P3
plan: surface-walk
---

# The cohort render check reports state and data colour as divergence

## What

`cohortRenders` in `tests/support/browser/surface-checkpoint.ts` fails on a tied edge vote in the Characters confirm dialogs, a filled row among unfilled message rows, an open collapsible among closed ones, the series colours of a segment bar and a selected glyph button. Evidence: the desktop evidence walk report under reports/cb-walk-evidence.

## Why

A check that calls state and data colour a divergence trains readers to skip its findings.

## Done when

A tied vote and a cohort that mixes states or data colours yield no verdict, a planted sibling with the wrong fill still fails, and the named checkpoints stop failing.

## Evidence

Filled at landing: what ran and where its output is.
