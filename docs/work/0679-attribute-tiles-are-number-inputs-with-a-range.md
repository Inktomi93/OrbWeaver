---
kind: bug
status: open
updated: 2026-10-04
priority: P3
area: rpg
---

# Attribute tiles are number inputs with a range

## What

A tile is a free-text box with no arrow-key step and no 1 to 20 hint. Owner ruling: keep click to type; use a number input with the ruleset's min and max; no stepper buttons. Final visual pass; review: ~/homelab/development/probe-archive/side-eye-reviews/final-pass-1-rails-home.md.

## Why

Launch visual pass finding.

## Done when

Tiles take numbers only, arrow keys step by one, and the range shows as a hint, with a test.

## Evidence

Filled at landing: what ran and where its output is.
