---
kind: bug
status: open
updated: 2026-10-30
priority: P2
area: ui
plan: surface-walk
---

# Govern ECharts default chrome colors in charts

## What

Heatmap split-area backgrounds and the legend track (inactiveColor) still use ECharts' built-in light gray (measured rgba(232,236,244,0.75) and about rgb(213,214,218)) in every theme, including dark.

## Why

Ungoverned light gray sits behind chart cells and the legend in every theme.

## Done when

Those options come from theme tokens through useChartTheme, proven by a canvas pixel test across themes.

## Evidence

Filled at landing: what ran and where its output is.
