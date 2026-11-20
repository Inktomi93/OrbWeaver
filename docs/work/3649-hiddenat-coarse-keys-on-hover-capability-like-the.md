---
kind: bug
status: open
updated: 2026-11-20
priority: P3
area: ui
plan: cross-surface-consistency
---

# hiddenAt coarse keys on hover capability like the message actions

## What

The message actions now key on hover capability through useHoverCapable, while the hiddenAt coarse prop in @orb/ui still keys on pointer size, so a fine pointer with no hover hides controls it can reach only by hover.

## Why

A stylus or a fine pointer with no hover loses controls behind a hover it cannot make.

## Done when

hiddenAt keys on hover capability or records why pointer size is right for each user, with a component test at a fine pointer with no hover.

## Evidence

Filled at landing: what ran and where its output is.
