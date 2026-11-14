---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
plan: cross-surface-consistency
---

# Evidence walk: inactive-control-legibility on the rails and Characters, Chat, Config

## What

A disabled solid Button wears the muted pair at full opacity; `opacity-disabled` no longer stacks on it. Check every fill style's disabled text against `INACTIVE_ADVISORY_MAX_RATIO` and retune the `opacity.disabled` token in `packages/ui/src/tokens/tokens.json` if a fill-less style falls under it.

## Why

A disabled control dimmed twice can read as absent, and a keyboard user can land on an `aria-disabled` control they cannot see.

## Done when

a component test mounts the greeting studio, the composer corrections dialog and the roster member editor in their disabled states and runs the design audit's inactive-control-legibility rule, red before and green after, and a Button CT reads each fill style's disabled ink.

## Evidence

Filled at landing: what ran and where its output is.
