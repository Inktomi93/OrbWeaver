---
kind: bug
status: done
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

Defaults found in ECharts 6, all in `packages/ui/node_modules/echarts/lib`:

- Heatmap `splitArea` (x and y axes) bands `rgba(234,237,245,0.5)` and clear; measured composite 232,236,244.
- `visualMap.inactiveColor` (the legend track) neutral gray; `visualMap.handleStyle.borderColor` white.
- `tooltip.backgroundColor` white, gray text, in all five option builders (bar-list, histogram, scatter, heatmap, sparkline); the axis-triggered histogram and sparkline also took the default axis-pointer line.

Roles added to `ChartColors` (`packages/ui/src/charts/chart/use-chart-theme.ts`), all from existing tokens: `track` (`color.muted`), `surface` (`color.popover`), `surfaceText` (`color.popover-foreground`). The tooltip border and axis-pointer line use the existing `axisLine`. `chartTooltipChrome` in `packages/ui/src/charts/chart/merge-option.ts` is the one home of the tooltip chrome.

Proof: `tests/ui/charts/heatmap/platform-heatmap-paint.suite.ct.tsx`, case "Heatmap split areas, legend track and tooltip paint their theme tokens", over the five themes of `heatmap-paint-themes.ts` (dark, light, custom, grey-base, wide-gamut). The oracle is the browser's own canvas paint of the token.

- Red on unchanged code, Chromium: split area read 232,236,244,192 where the muted token was expected. Then, with splitArea alone fixed: legend track red; with the track fixed: tooltip background `rgb(255, 255, 255)` red.
- Green: `pnpm test:ct` (Chromium) 2 passed; `pnpm test:ct:webkit` 2 passed.
- `pnpm typecheck packages/ui/tsconfig.json tsconfig.tests-dom.json`, Biome and `pnpm lint:eslint packages/ui/src/charts tests/ui/charts/heatmap` clean.
