---
kind: bug
status: doing
updated: 2026-11-20
priority: P2
area: theming
lane: wt/agent-a3ade30f662ad8af9
plan: cross-surface-consistency
---

# An accent-only custom theme gets its own disabled dimming step

## What

A custom theme that sets only an accent over a seed emits no --opacity-disabled (packages/kit/src/theme-derivation clamp.ts, the carried === null branch), so it keeps the seed step: accent oklch(0.65 0.12 150) over Light keeps 78% while the solve needs 86%. D355 records it as a D336 gap.

## Why

Disabled controls on such a theme can read as enabled, the defect 3021 closed for seeds.

## Done when

Every custom theme, accent-only included, emits a solved disabled step, and a test with that accent over Light asserts the solved value.

## Evidence

Filled at landing: what ran and where its output is.
