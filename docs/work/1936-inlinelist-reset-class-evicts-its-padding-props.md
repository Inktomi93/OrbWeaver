---
kind: bug
status: open
updated: 2026-11-06
priority: P3
area: ui
plan: cross-surface-consistency
---

# InlineList reset class evicts its padding props

## What

InlineList appends p-0 after the recipe, so tailwind-merge drops padding, paddingInline and paddingBlock, though its props type promises them.

## Why

A prop the type offers does nothing, and no caller shows it today.

## Done when

The reset is ordered before the recipe's padding, or the props are omitted from InlineList.

## Evidence

Filled at landing: what ran and where its output is.
