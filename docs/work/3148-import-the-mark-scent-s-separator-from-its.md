---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: client
plan: cross-surface-consistency
---

# Import the mark scent's separator from its production home in the marks test

## What

`markSubtitle` in `packages/client/src/features/rpg/components/rpg-journal-tab.tsx` joins the date and the trigger with a literal separator, and `tests/client/features/rpg/components/hidden-log-and-marks.ct.tsx` copies that literal.

## Why

A copied literal goes stale silently when production changes it.

## Done when

The separator has one production home the journal tab and the test both import, or the test asserts the scent's parts.

## Evidence

Filled at landing: what ran and where its output is.
