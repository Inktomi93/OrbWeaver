---
kind: bug
status: open
updated: 2026-11-07
priority: P3
area: client
plan: cross-surface-consistency
---

# Rendered review of the production Reset and Undo path

## What

snap runs a dev build, which shows the dev row menu instead of the production Reset button that becomes Undo. From the rendered recheck under reports/ux-reviewer.

## Why

the Undo focus fix (1826c) has no rendered check.

## Done when

a snap or CT path that renders the production row actions, with Undo focus asserted.

## Evidence

Filled at landing: what ran and where its output is.
