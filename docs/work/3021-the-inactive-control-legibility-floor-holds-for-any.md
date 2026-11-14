---
kind: decision
status: open
updated: 2026-11-14
priority: P2
area: ui
---

# The inactive-control legibility floor holds for any theme, not only the seeds

## What

The 3:1 floor for a disabled control's ink exists only in the audit tooling (`tooling/src/floor/instrument/wcag.ts`, `tooling/src/ui-audit/lib/checks-color.ts`) and in a component test over the seed themes. Nothing in the product holds a custom or imported theme to it: a fill-less disabled Button's ink is the tone text colour at the `opacity.disabled` token, so a theme whose tone colours are light fails the floor silently. Owner ruling: a standard applies to anything, and a theme adjusts to meet it; the standard is never tuned to a theme. Rule how the product enforces the floor for every theme, against D71's existing theme floors: derive the disabled ink so it clears the floor whatever the theme's colours, or judge a theme at save and import the way D71's other floors do and tell the author which pair fails.

## Why

A user's own theme can ship disabled controls nobody can read, and the seeds passed or failed by the accident of their colours.

## Done when

The ruling is recorded in D71 or a new decision, the product applies it to seed, custom and imported themes through one home, and a case feeds a theme with light tone colours through the theme door and asserts the outcome the ruling names.

## Evidence

Filled at landing: what ran and where its output is.
