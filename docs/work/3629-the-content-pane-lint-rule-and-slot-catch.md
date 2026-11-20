---
kind: work
status: open
updated: 2026-11-20
priority: P3
area: ui
plan: cross-surface-consistency
---

# The content pane lint rule and slot catch every bypass

## What

orb/content-pane-scroller misses scroll list, an aliased Stack, panes under packages/client/src/components and expression values; and a caller's data-slot replaces content-pane on several panes, so owner CSS keyed on that slot misses them.

## Why

A rule with holes lets the next section bypass the template unseen, and a lost slot breaks owner styling.

## Done when

The rule catches each listed shape with a rule test, and the pane's own slot survives a caller's slot.

## Evidence

Filled at landing: what ran and where its output is.
