---
kind: bug
status: open
updated: 2026-10-30
priority: P2
area: ui
---

# The heatmap paint CT fails on main in the dark theme

## What

tests/ui/charts/heatmap/platform-heatmap-paint.suite.ct.tsx fails on main: heatmap cells and the legend paint 13 channels off their token in the dark theme. Found by the 1421 step 4a lane on a clean main checkout.

## Why

A red CT on main blocks a green floor for every lane and may hide a real chart colour regression.

## Done when

The cause is named, the paint matches its token in every theme, and the suite passes on main on Chromium and WebKit.

## Evidence

Filled at landing: what ran and where its output is.
