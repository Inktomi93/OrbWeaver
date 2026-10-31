---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the ui shapes the unwired shapes scan reports

## What

`pnpm unwired shapes` reports each of the shapes below in `ui`; `reports/unwired/shapes.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Shape | At | Kind | Class | Decision |
| - | - | - | - | - |
| `BarListItem` / `BarListItem` | `ui/src/charts/bar-list/index.ts:6` | reexport-chain | delete | export it from its home, not through `ui/src/charts/bar-list/bar-list.tsx` |
| `OrbChartOption` / `EChartsOption` | `ui/src/charts/chart/echarts-setup.ts:11` | renamed-reexport | delete | use the home name `EChartsOption` |
| `OrbEChartsInstance` / `EChartsType` | `ui/src/charts/chart/echarts-setup.ts:12` | renamed-reexport | delete | use the home name `EChartsType` |
| `OrbEChartsInstance` / `EChartsType` | `ui/src/charts/chart/index.ts:9` | reexport-chain | delete | export it from its home, not through `ui/src/charts/chart/echarts-setup.ts` |
| `HeatmapMatrix` / `HeatmapMatrix` | `ui/src/charts/heatmap/index.ts:6` | reexport-chain | delete | export it from its home, not through `ui/src/charts/heatmap/heatmap.tsx` |
| `HistogramBucket` / `HistogramBucket` | `ui/src/charts/histogram/index.ts:6` | reexport-chain | delete | export it from its home, not through `ui/src/charts/histogram/histogram.tsx` |
| `ScatterPoint` / `ScatterPoint` | `ui/src/charts/scatter/index.ts:7` | reexport-chain | delete | export it from its home, not through `ui/src/charts/scatter/scatter.tsx` |
| `ScatterSeries` / `ScatterSeries` | `ui/src/charts/scatter/index.ts:7` | reexport-chain | delete | export it from its home, not through `ui/src/charts/scatter/scatter.tsx` |
| `CssMergeTraceSnapshot` / `CssMergeTraceSnapshot` | `ui/src/lib/index.ts:17` | reexport-chain | delete | export it from its home, not through `ui/src/lib/css-merge-trace.ts` |
| `ColorSchemeQuery` / `ReducedMotionQuery` | `ui/src/lib/use-prefers-light-color-scheme.ts:3` | restated | delete (read) | both are the `matchMedia` list view: give it one home in `packages/ui/src/lib/` both hooks use |
| `Range` / `HighlightedTextRange` | `ui/src/markdown/dialogue.ts:45` | restated | unknown (read) | a `{ start, end }` range: fold the character ranges into kit's `Span`; byte, box and pixel spans are other concepts and stay |
| `Range` / `PinnedSpan` | `ui/src/markdown/dialogue.ts:45` | restated | unknown (read) | a `{ start, end }` range: fold the character ranges into kit's `Span`; byte, box and pixel spans are other concepts and stay |
| `AutocompleteGroup` / `ComboboxGroup` | `ui/src/primitives/autocomplete/autocomplete.tsx:22` | restated | delete (read) | one concept, one home: export `ComboboxGroup` once and derive `AutocompleteGroup` from it |
| `HighlightedTextRange` / `PinnedSpan` | `ui/src/primitives/highlighted-text/highlighted-text.tsx:7` | restated | unknown (read) | a `{ start, end }` range: fold the character ranges into kit's `Span`; byte, box and pixel spans are other concepts and stay |
| `AlertTriangle` / `TriangleAlert` | `ui/src/primitives/icons/index.ts:6` | renamed-reexport | delete (read) | the door renames a library icon: use the library's name at every importer, or record why the door keeps the old name |
| `History` / `RotateCcwClock` | `ui/src/primitives/icons/index.ts:63` | renamed-reexport | delete (read) | the door renames a library icon: use the library's name at every importer, or record why the door keeps the old name |
| `MapIcon` / `Map` | `ui/src/primitives/icons/index.ts:80` | renamed-reexport | delete (read) | the door renames a library icon: use the library's name at every importer, or record why the door keeps the old name |
| `MoreHorizontal` / `Ellipsis` | `ui/src/primitives/icons/index.ts:87` | renamed-reexport | delete (read) | the door renames a library icon: use the library's name at every importer, or record why the door keeps the old name |
| `MoreVertical` / `EllipsisVertical` | `ui/src/primitives/icons/index.ts:88` | renamed-reexport | delete (read) | the door renames a library icon: use the library's name at every importer, or record why the door keeps the old name |
| `SmilePlus` / `FaceSlightlySmilingPlus` | `ui/src/primitives/icons/index.ts:111` | renamed-reexport | delete (read) | the door renames a library icon: use the library's name at every importer, or record why the door keeps the old name |
| `Trash2` / `Trash` | `ui/src/primitives/icons/index.ts:117` | renamed-reexport | delete (read) | the door renames a library icon: use the library's name at every importer, or record why the door keeps the old name |
| `PinnedSpan` / `Range` | `ui/src/primitives/message-list/pin-spacer.ts:19` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `ui/src/markdown/dialogue.ts:45`; a shape that matches by coincidence stays |
| `PinnedSpan` / `HighlightedTextRange` | `ui/src/primitives/message-list/pin-spacer.ts:19` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `ui/src/primitives/highlighted-text/highlighted-text.tsx:7`; a shape that matches by coincidence stays |
| `StreamShimmerProps` / `TypingDotsProps` | `ui/src/stream/shimmer.tsx:5` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `ui/src/stream/typing-dots.tsx:4`; a shape that matches by coincidence stays |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired shapes` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
