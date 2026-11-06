---
kind: bug
status: open
updated: 2026-11-06
priority: P2
area: ui
plan: cross-surface-consistency
---

# Landscape rail: active section can sit outside the rail

## What

At 844x390 the rail stays at scrollTop 0 when the active section is Databank, so the rail shows no current location. Reveal the active button on section change.

## Why

A reader loses where they are.

## Done when

The active button is in view after every section change at phone landscape sizes.

## Evidence

Filled at landing: what ran and where its output is.
