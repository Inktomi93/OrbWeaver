---
kind: bug
status: doing
updated: 2026-10-30
priority: P1
area: ui
lane: chart
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

- Boundary: `useChartTheme` (`packages/ui/src/charts/chart/use-chart-theme.ts`) gets every governed chart color from `resolveCanvasColor` in the live-token seam (`packages/ui/src/lib/live-token-resolver.ts`). It resolves the token through the cascade on the live-token root, paints the computed color into one CPU-backed canvas pixel and returns the engine's `rgba()` reading. zrender parses only legacy sRGB, so OKLCH ramp ends interpolated to black. The engine converts every form it computes: OKLCH, Lab, `color()` spaces, `color-mix()` results and `none` hues. Nothing is left to throw on.
- `tests/ui/charts/heatmap/platform-heatmap-paint.suite.ct.tsx` mounts the public Heatmap in a live ThemeScope. It steps through dark, light, a custom carried base, an achromatic `#1e1e1e` base and a custom-theme override with `color(display-p3 …)`, `lab(…)` and `color-mix(in srgb …)`. It reads each renderer canvas layer and the composited screen; a native 2D canvas painting the cascade-resolved token is the oracle. It asserts that the high cell is the series token, the low cell is the border token with its alpha, the three cells differ, the legend ramp approaches the series color and composites as painted, and every step repaints differently.
- Red first: against the original hook the high cell missed the series token by 212 per channel. Against the kit-parser version the achromatic base threw `oklch(0.362031 0 none)` in WebKit and the wide-gamut override threw `color(display-p3 0.95 0.35 0.1)` in Chromium.
- `pnpm test:ct` and `pnpm test:ct:webkit` for that suite, five repeats each: all pass.
