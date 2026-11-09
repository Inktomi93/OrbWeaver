---
kind: bug
status: open
updated: 2026-11-09
priority: P2
area: ui
plan: cross-surface-consistency
---

# A form dialog title keeps its line in a landscape phone

## What

On a landscape phone (568x320) at default text, form dialog titles collapse to zero height: the title's one-line truncation sits inside the scrolling body (packages/ui/src/primitives/dialog/variants.ts, since 0f35cba9f3).

## Why

A dialog with no visible title gives no context for its fields.

## Done when

The title holds at least one line at 568x320 at default and 300% text, with a CT that fails on main.

## Evidence

Filled at landing: what ran and where its output is.
