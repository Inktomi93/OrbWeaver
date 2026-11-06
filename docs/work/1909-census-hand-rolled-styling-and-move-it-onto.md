---
kind: work
status: open
updated: 2026-11-06
priority: P2
area: ui
plan: cross-surface-consistency
---

# Census hand-rolled styling and move it onto tokens and design system primitives

## What

Build a repeatable census of hand-rolled styling across packages/client and packages/ui: raw values, className utilities that bypass a recipe, inline styles, repeated utility clusters, and constants that repeat a token. Classify each as token, recipe or primitive move, or keep with a reason, then migrate the owners.

## Why

Most consistency drift starts where a surface hand-rolls what the ramps, tokens and primitives already own. The stylesheet review covered only the sheets.

## Done when

The census runs from pnpm ui-facts, every hit is classified, moves are landed or filed by owner, and new hand-rolling shows up in the census.

## Evidence

Filled at landing: what ran and where its output is.
