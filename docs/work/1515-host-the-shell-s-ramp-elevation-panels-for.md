---
kind: bug
status: open
updated: 2026-10-31
priority: P3
area: ui
plan: css-system
---

# Host the shell's ramp-elevation panels for tone tints

## What

Item 1449 made tone tints mix over their host surface through --tone-host, set by the surface primitives. The shell panels in packages/client/src/features/app-shell/surfaces/shell/grid.css that paint card or raised fills under the ramp elevation set no --tone-host, so a soft badge inside a ramp panel still mixes over the page background.

## Why

D336 as amended by 1449: a tint stays distinct from the host it sits on.

## Done when

Each ramp-elevation panel sets its host through the tone-host utility; tests/ui/content/theme-scope/platform-tone-host.suite.ct.tsx covers a soft badge inside a ramp panel in each seed, red first.

## Evidence

Filled at landing: what ran and where its output is.
