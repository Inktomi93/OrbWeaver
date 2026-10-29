---
kind: bug
status: open
updated: 2026-10-29
priority: P1
area: ui
plan: surface-walk
---

# Resolve chart gradient colors into renderer-supported values

## What

Heatmap cells and legend gradients paint black because ECharts visual mapping cannot parse resolved OKLCH theme colors. Inspect the shared chart theme boundary and affected interpolated paints.

## Why

Different values become visually indistinguishable despite valid geometry and token provenance.

## Done when

Convert governed colors through a supported shared renderer boundary, preserving alpha and theme updates. Prove distinct data colors and legend stops in real Chromium and WebKit pixels, including relevant theme changes. Preserve source tokens and existing layout behavior.

## Evidence

Filled at landing: what ran and where its output is.
