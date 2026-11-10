---
kind: bug
status: open
updated: 2026-11-10
priority: P3
area: tooling
plan: cross-surface-consistency
---

# The rest glow census sanctions the CTA glow token only on a hovered call to action

## What

glow-shadow excludes a rest-walk shadow equal to the resolved CTA glow token as sanctionedGlowCarrier on any element, so a non-CTA card wearing that glow at rest passes. The ratified use is hover-only on a call to action (tooling/src/ui-audit state-glow token test).

## Why

A card that glows at rest with the CTA token borrows the primary action's emphasis, which the glow rule exists to catch.

## Done when

The sanctionedGlowCarrier exclusion applies only to a hovered call to action; a fixture of a non-CTA card with the token glow at rest fires, and the hovered CTA control stays excluded.

## Evidence

Filled at landing: what ran and where its output is.
