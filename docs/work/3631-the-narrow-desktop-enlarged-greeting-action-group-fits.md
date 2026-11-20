---
kind: bug
status: open
updated: 2026-11-20
priority: P2
area: ui
plan: cross-surface-consistency
---

# The narrow desktop enlarged greeting action group fits its row

## What

tests/client/components/platform-remaining-action-groups.suite.ct.tsx fails on main after the content pane merge: at a narrow desktop width with enlarged text, the greeting action group overflows its row by eighteen pixels against a limit of one.

## Why

A red case on main means the barrier fails, and the overflow is visible to a user who enlarges text.

## Done when

The group fits its row at that width and text size through the shared owner, and the case passes on main.

## Evidence

Filled at landing: what ran and where its output is.
