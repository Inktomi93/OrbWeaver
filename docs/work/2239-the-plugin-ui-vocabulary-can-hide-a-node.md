---
kind: work
status: open
updated: 2026-11-08
priority: P3
area: plugins
plan: cross-surface-consistency
---

# The plugin UI vocabulary can hide a node or bind a grid's empty text

## What

Card Atlas at rest doubles its empty state and shows a dead pager, because the plugin UI vocabulary has no conditional visibility and no bound empty text for a grid. Add one of the two to the vocabulary and the SDK, then fix Card Atlas through it.

## Why

A showcase plugin that cannot hide a dead control teaches every plugin author the same broken rest state.

## Done when

The vocabulary carries the chosen primitive with a contract test, Card Atlas at rest shows one empty state and no pager, and a CT proves it.

## Evidence

Filled at landing: what ran and where its output is.
