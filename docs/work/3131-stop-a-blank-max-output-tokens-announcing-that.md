---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: ui
plan: cross-surface-consistency
---

# Stop a blank Max output tokens announcing that the model decides

## What

knobGhost in packages/client/src/features/preset/lib/effective-knobs.ts sets modelDecides for every step except the sent window, so the inherited thumb on Max output tokens announces 'default (model decides)' although the request sends the default itself.

## Why

A screen-reader user is told the wrong source for the reply length. Fold into the blank Max output tokens item if that lands first.

## Done when

The floor step announces a plain default, and a CT reads the slider's value text.

## Evidence

Filled at landing: what ran and where its output is.
