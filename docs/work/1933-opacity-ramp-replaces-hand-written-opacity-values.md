---
kind: work
status: open
updated: 2026-11-06
priority: P2
area: ui
plan: cross-surface-consistency
---

# Opacity ramp replaces hand-written opacity values

## What

Mint a full --opacity-\* ramp and round every hand-written opacity onto it, art sheets included. Zero and full opacity stay as they are.

## Why

Opacity values are hand-spelled across recipes and sheets, with one named step in the token file.

## Done when

No sheet or recipe writes a numeric opacity step outside the ramp.

## Evidence

Filled at landing: what ran and where its output is.
