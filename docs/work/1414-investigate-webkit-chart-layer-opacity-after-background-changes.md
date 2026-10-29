---
kind: bug
status: open
updated: 2026-10-29
priority: P1
area: ui
plan: surface-walk
---

# Investigate WebKit chart layer opacity after background changes

## What

A WebKit upper canvas becomes opaque after root background changes and obscures correctly colored chart data. A bare installed ECharts reproduction excludes React and application fixture code; the native cause remains unproven.

## Why

Correct color values and geometry do not establish visible data when an opaque canvas covers the plot.

## Done when

Identify the native or vendor cause with a minimal retained reproduction. Qualify a supported fix or precise platform limitation with actual composited pixels, theme transitions and unchanged chart data. Do not hide the failure with a z-level workaround.

## Evidence

Filled at landing: what ran and where its output is.
