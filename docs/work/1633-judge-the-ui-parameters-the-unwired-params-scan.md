---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the ui parameters the unwired params scan reports

## What

`pnpm unwired params` reports each of the parameters below in `ui`; `reports/unwired/params.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Parameter | At | Kind | Class | Decision |
| - | - | - | - | - |
| `ArtBleed.#0.className` | `ui/src/art/art-bleed/art-bleed.tsx:45` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `WeaveGlyph.#0.className` | `ui/src/art/web-weave/weave-glyph.tsx:40` | unsupplied-prop | delete | delete the prop and its default path (8 calls) |
| `WeaveGlyph.#0.ink` | `ui/src/art/web-weave/weave-glyph.tsx:40` | unsupplied-prop | delete | delete the prop and its default path (8 calls) |
| `WebWeave.#0.spider` | `ui/src/art/web-weave/web-weave.tsx:156` | unsupplied-prop | delete | delete the prop and its default path (2 calls) |
| `WebWeave.#0.glow` | `ui/src/art/web-weave/web-weave.tsx:156` | unsupplied-prop | delete | delete the prop and its default path (2 calls) |
| `WebWeave.#0.onSettled` | `ui/src/art/web-weave/web-weave.tsx:156` | unsupplied-prop | delete | delete the prop and its default path (2 calls) |
| `WebWeave.#0.wind` | `ui/src/art/web-weave/web-weave.tsx:156` | unsupplied-prop | delete | delete the prop and its default path (2 calls) |
| `WebWeave.#0.character` | `ui/src/art/web-weave/web-weave.tsx:156` | unsupplied-prop | delete | delete the prop and its default path (2 calls) |
| `WebWeave.#0.tempo` | `ui/src/art/web-weave/web-weave.tsx:156` | unsupplied-prop | delete | delete the prop and its default path (2 calls) |
| `BarList.#0.height` | `ui/src/charts/bar-list/bar-list.tsx:47` | unsupplied-prop | delete | delete the prop and its default path (10 calls) |
| `BarList.#0.className` | `ui/src/charts/bar-list/bar-list.tsx:47` | unsupplied-prop | delete | delete the prop and its default path (10 calls) |
| `BarList.#0.onChartReady` | `ui/src/charts/bar-list/bar-list.tsx:47` | unsupplied-prop | delete | delete the prop and its default path (10 calls); 1 test call supply it |
| `Chart.#0.className` | `ui/src/charts/chart/chart.tsx:39` | unsupplied-prop | delete | delete the prop and its default path (5 calls) |
| `Heatmap.#0.height` | `ui/src/charts/heatmap/heatmap.tsx:31` | unsupplied-prop | delete | delete the prop and its default path (1 call); 2 test calls supply it |
| `Heatmap.#0.className` | `ui/src/charts/heatmap/heatmap.tsx:31` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `Heatmap.#0.onChartReady` | `ui/src/charts/heatmap/heatmap.tsx:31` | unsupplied-prop | delete | delete the prop and its default path (1 call); 2 test calls supply it |
| `Histogram.#0.height` | `ui/src/charts/histogram/histogram.tsx:31` | unsupplied-prop | delete | delete the prop and its default path (3 calls) |
| `Histogram.#0.className` | `ui/src/charts/histogram/histogram.tsx:31` | unsupplied-prop | delete | delete the prop and its default path (3 calls) |
| `Histogram.#0.onChartReady` | `ui/src/charts/histogram/histogram.tsx:31` | unsupplied-prop | delete | delete the prop and its default path (3 calls) |
| `CoinFigure.#0.className` | `ui/src/charts/meter/coin-figure.tsx:54` | unsupplied-prop | delete | delete the prop and its default path (2 calls) |
| `SegmentedClock.#0.hidden` | `ui/src/charts/meter/segmented-clock.tsx:58` | unsupplied-prop | delete | delete the prop and its default path (2 calls); 1 test call supply it |
| `SegmentedClock.#0.className` | `ui/src/charts/meter/segmented-clock.tsx:58` | unsupplied-prop | delete | delete the prop and its default path (2 calls) |
| `Scatter.#0.onChartReady` | `ui/src/charts/scatter/scatter.tsx:74` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `StatFigure.#0.delta` | `ui/src/charts/stat-figure/stat-figure.tsx:34` | unsupplied-prop | delete | delete the prop and its default path (52 calls) |
| `StatFigure.#0.trend` | `ui/src/charts/stat-figure/stat-figure.tsx:34` | unsupplied-prop | delete | delete the prop and its default path (52 calls) |
| `StatFigure.#0.sparklineHeight` | `ui/src/charts/stat-figure/stat-figure.tsx:34` | unsupplied-prop | delete | delete the prop and its default path (52 calls) |
| `StatFigure.#0.className` | `ui/src/charts/stat-figure/stat-figure.tsx:34` | unsupplied-prop | delete | delete the prop and its default path (52 calls) |
| `StatFigure.#0.onChartReady` | `ui/src/charts/stat-figure/stat-figure.tsx:34` | unsupplied-prop | delete | delete the prop and its default path (52 calls) |
| `toneMixOf.tone` | `ui/src/content/theme-scope/tone-knobs.ts:173` | same-literal | delete | inline `"primary"` and drop the parameter (3 calls) |
| `ThemeSwatchStrip.#0.size` | `ui/src/content/theme-swatch/theme-swatch.tsx:29` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `ThemeSwatchStrip.#0.className` | `ui/src/content/theme-swatch/theme-swatch.tsx:29` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `DiffView.#0.className` | `ui/src/diff/diff.tsx:41` | unsupplied-prop | delete | delete the prop and its default path (3 calls) |
| `useFuzzySearch.options.searchFields` | `ui/src/fuzzy-search/fuzzy-search.ts:144` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `useFuzzySearch.options.storeFields` | `ui/src/fuzzy-search/fuzzy-search.ts:144` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `useFuzzySearch.options.boost` | `ui/src/fuzzy-search/fuzzy-search.ts:144` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `useFuzzySearch.options.fuzzy` | `ui/src/fuzzy-search/fuzzy-search.ts:144` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `useFuzzySearch.options.prefix` | `ui/src/fuzzy-search/fuzzy-search.ts:144` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `useFuzzySearch.options.combineWith` | `ui/src/fuzzy-search/fuzzy-search.ts:144` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `createRevealPlugin.now` | `ui/src/markdown/reveal-plugin.ts:188` | unsupplied | delete | delete the parameter and its default path (1 call) |
| `Autocomplete.#0.groups` | `ui/src/primitives/autocomplete/autocomplete.tsx:223` | unsupplied-prop | delete (read) | no production element groups its suggestions, only a test does: delete the grouped mode and its group types |
| `Autocomplete.#0.defaultValue` | `ui/src/primitives/autocomplete/autocomplete.tsx:223` | unsupplied-prop | delete | delete the prop and its default path (2 calls) |
| `Autocomplete.#0.disabled` | `ui/src/primitives/autocomplete/autocomplete.tsx:223` | unsupplied-prop | delete | delete the prop and its default path (2 calls) |
| `Autocomplete.#0.emptyText` | `ui/src/primitives/autocomplete/autocomplete.tsx:223` | unsupplied-prop | delete | delete the prop and its default path (2 calls) |
| `Autocomplete.#0.size` | `ui/src/primitives/autocomplete/autocomplete.tsx:223` | unsupplied-prop | delete | delete the prop and its default path (2 calls); 1 test call supply it |
| `Autocomplete.#0.clearLabel` | `ui/src/primitives/autocomplete/autocomplete.tsx:223` | unsupplied-prop | delete | delete the prop and its default path (2 calls) |
| `Autocomplete.#0.className` | `ui/src/primitives/autocomplete/autocomplete.tsx:223` | unsupplied-prop | delete | delete the prop and its default path (2 calls) |
| `Autocomplete.#0.id` | `ui/src/primitives/autocomplete/autocomplete.tsx:223` | unsupplied-prop | delete | delete the prop and its default path (2 calls) |
| `Autocomplete.#0.arrow` | `ui/src/primitives/autocomplete/autocomplete.tsx:223` | unsupplied-prop | delete | delete the prop and its default path (2 calls) |
| `Autocomplete.#0.side` | `ui/src/primitives/autocomplete/autocomplete.tsx:223` | unsupplied-prop | delete | delete the prop and its default path (2 calls) |
| `Autocomplete.#0.align` | `ui/src/primitives/autocomplete/autocomplete.tsx:223` | unsupplied-prop | delete | delete the prop and its default path (2 calls) |
| `Autocomplete.#0.sideOffset` | `ui/src/primitives/autocomplete/autocomplete.tsx:223` | unsupplied-prop | delete | delete the prop and its default path (2 calls) |
| `Autocomplete.#0.container` | `ui/src/primitives/autocomplete/autocomplete.tsx:223` | unsupplied-prop | delete | delete the prop and its default path (2 calls) |
| `avatarStackInlineSize.size` | `ui/src/primitives/avatar-stack/geometry.ts:46` | same-literal | delete | inline `"md"` and drop the parameter (2 calls) |
| `BackgroundVideo.#0.paused` | `ui/src/primitives/background-video/background-video.tsx:48` | unsupplied-prop | delete | delete the prop and its default path (2 calls) |
| `ColorSwatch.#0.label` | `ui/src/primitives/color-field/color-field.tsx:30` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `Combobox.#0.items` | `ui/src/primitives/combobox/combobox.tsx:112` | unsupplied-prop | delete | delete the prop and its default path (1 call); 4 test calls supply it |
| `Combobox.#0.groups` | `ui/src/primitives/combobox/combobox.tsx:112` | unsupplied-prop | delete (read) | no production element groups its suggestions, only a test does: delete the grouped mode and its group types |
| `Combobox.#0.defaultValue` | `ui/src/primitives/combobox/combobox.tsx:112` | unsupplied-prop | delete | delete the prop and its default path (1 call); 2 test calls supply it |
| `Combobox.#0.disabled` | `ui/src/primitives/combobox/combobox.tsx:112` | unsupplied-prop | delete | delete the prop and its default path (1 call); 1 test call supply it |
| `Combobox.#0.emptyText` | `ui/src/primitives/combobox/combobox.tsx:112` | unsupplied-prop | delete | delete the prop and its default path (1 call); 1 test call supply it |
| `Combobox.#0.aria-label` | `ui/src/primitives/combobox/combobox.tsx:112` | unsupplied-prop | delete | delete the prop and its default path (1 call); 5 test calls supply it |
| `Combobox.#0.aria-describedby` | `ui/src/primitives/combobox/combobox.tsx:112` | unsupplied-prop | delete | delete the prop and its default path (1 call); 1 test call supply it |
| `Combobox.#0.size` | `ui/src/primitives/combobox/combobox.tsx:112` | unsupplied-prop | delete | delete the prop and its default path (1 call); 3 test calls supply it |
| `Combobox.#0.className` | `ui/src/primitives/combobox/combobox.tsx:112` | unsupplied-prop | delete | delete the prop and its default path (1 call); 1 test call supply it |
| `Combobox.#0.id` | `ui/src/primitives/combobox/combobox.tsx:112` | unsupplied-prop | delete | delete the prop and its default path (1 call); 1 test call supply it |
| `Combobox.#0.arrow` | `ui/src/primitives/combobox/combobox.tsx:112` | unsupplied-prop | delete | delete the prop and its default path (1 call); 1 test call supply it |
| `Combobox.#0.side` | `ui/src/primitives/combobox/combobox.tsx:112` | unsupplied-prop | delete | delete the prop and its default path (1 call); 1 test call supply it |
| `Combobox.#0.align` | `ui/src/primitives/combobox/combobox.tsx:112` | unsupplied-prop | delete | delete the prop and its default path (1 call); 1 test call supply it |
| `Combobox.#0.sideOffset` | `ui/src/primitives/combobox/combobox.tsx:112` | unsupplied-prop | delete | delete the prop and its default path (1 call); 1 test call supply it |
| `Combobox.#0.container` | `ui/src/primitives/combobox/combobox.tsx:112` | unsupplied-prop | delete | delete the prop and its default path (1 call); 1 test call supply it |
| `CommandInput.#0.className` | `ui/src/primitives/command/command.tsx:67` | unsupplied-prop | delete | delete the prop and its default path (4 calls) |
| `CompareBlocks.#0.accepted` | `ui/src/primitives/compare-blocks/compare-blocks.tsx:250` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `CompareBlocks.#0.onAcceptedChange` | `ui/src/primitives/compare-blocks/compare-blocks.tsx:250` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `CompareBlocks.#0.acceptAllLabel` | `ui/src/primitives/compare-blocks/compare-blocks.tsx:250` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `CompareBlocks.#0.className` | `ui/src/primitives/compare-blocks/compare-blocks.tsx:250` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `CopyButtonStatus.#0.className` | `ui/src/primitives/copy-button/copy-button.tsx:154` | unsupplied-prop | delete | delete the prop and its default path (2 calls) |
| `CrossfadeImage.#0.durationMs` | `ui/src/primitives/crossfade-image/crossfade-image.tsx:50` | unsupplied-prop | delete | delete the prop and its default path (2 calls) |
| `LogViewer.#0.maxLines` | `ui/src/primitives/log-viewer/log-viewer.tsx:87` | unsupplied-prop | delete | delete the prop and its default path (7 calls); 1 test call supply it |
| `MediaGrid.#0.overscan` | `ui/src/primitives/media-grid/media-grid.tsx:186` | unsupplied-prop | delete | delete the prop and its default path (4 calls) |
| `MediaTileGridSkeleton.#0.count` | `ui/src/primitives/media-tile-grid/media-tile-grid.tsx:170` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `MenuSeparator.props.className` | `ui/src/primitives/menu/menu.tsx:137` | unsupplied-prop | delete (read) | no separator takes a class: delete the prop from the primitive's props |
| `MessageList.#0.overscan` | `ui/src/primitives/message-list/message-list.tsx:111` | unsupplied-prop | delete | delete the prop and its default path (2 calls) |
| `MessageList.#0.scrollEndThreshold` | `ui/src/primitives/message-list/message-list.tsx:111` | unsupplied-prop | delete | delete the prop and its default path (2 calls) |
| `MessageList.#0.rangeExtractor` | `ui/src/primitives/message-list/message-list.tsx:111` | unsupplied-prop | delete | delete the prop and its default path (2 calls) |
| `MessageList.#0.useCachedMeasurements` | `ui/src/primitives/message-list/message-list.tsx:111` | unsupplied-prop | delete | delete the prop and its default path (2 calls) |
| `Progress.props.className` | `ui/src/primitives/progress/progress.tsx:23` | unsupplied-prop | delete | delete the prop and its default path (3 calls) |
| `Progress.props.trackClassName` | `ui/src/primitives/progress/progress.tsx:23` | unsupplied-prop | delete | delete the prop and its default path (3 calls) |
| `Progress.props.formatValue` | `ui/src/primitives/progress/progress.tsx:23` | unsupplied-prop | delete | delete the prop and its default path (3 calls) |
| `SortableList.#0.className` | `ui/src/primitives/sortable/sortable.tsx:241` | unsupplied-prop | delete | delete the prop and its default path (8 calls) |
| `WebSpinner.#0.className` | `ui/src/primitives/spinner/spinner.tsx:45` | unsupplied-prop | delete | delete the prop and its default path (8 calls) |
| `WebSpinner.#0.ink` | `ui/src/primitives/spinner/spinner.tsx:45` | unsupplied-prop | delete | delete the prop and its default path (8 calls) |
| `Table.#0.getRowLabel` | `ui/src/primitives/table/table.tsx:190` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `Table.#0.density` | `ui/src/primitives/table/table.tsx:190` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `Table.#0.sorting` | `ui/src/primitives/table/table.tsx:190` | unsupplied-prop | delete | delete the prop and its default path (1 call); 1 test call supply it |
| `Table.#0.defaultSorting` | `ui/src/primitives/table/table.tsx:190` | unsupplied-prop | delete | delete the prop and its default path (1 call); 1 test call supply it |
| `Table.#0.onSortingChange` | `ui/src/primitives/table/table.tsx:190` | unsupplied-prop | delete | delete the prop and its default path (1 call); 1 test call supply it |
| `Table.#0.pagination` | `ui/src/primitives/table/table.tsx:190` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `Table.#0.onPaginationChange` | `ui/src/primitives/table/table.tsx:190` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `Table.#0.selectable` | `ui/src/primitives/table/table.tsx:190` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `Table.#0.selectedRowIds` | `ui/src/primitives/table/table.tsx:190` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `Table.#0.defaultSelectedRowIds` | `ui/src/primitives/table/table.tsx:190` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `Table.#0.onSelectedRowIdsChange` | `ui/src/primitives/table/table.tsx:190` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `Table.#0.emptyState` | `ui/src/primitives/table/table.tsx:190` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `TabsIndicator.#0.className` | `ui/src/primitives/tabs/tabs.tsx:193` | unsupplied-prop | delete | delete the prop and its default path (2 calls) |
| `Toaster.props.container` | `ui/src/primitives/toast/toast.tsx:131` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `Toaster.props.swipeDirection` | `ui/src/primitives/toast/toast.tsx:131` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `ToolCallBlock.#0.defaultOpen` | `ui/src/primitives/tool-call-block/tool-call-block.tsx:57` | unsupplied-prop | delete (read) | no element opens the block by default: delete the prop and pass no `open` |
| `ToolCallBlock.#0.className` | `ui/src/primitives/tool-call-block/tool-call-block.tsx:57` | unsupplied-prop | delete | delete the prop and its default path (4 calls) |
| `VirtualList.#0.overscan` | `ui/src/primitives/virtual-list/virtual-list.tsx:96` | unsupplied-prop | delete | delete the prop and its default path (11 calls); 1 test call supply it |
| `VirtualList.#0.lanes` | `ui/src/primitives/virtual-list/virtual-list.tsx:96` | unsupplied-prop | delete | delete the prop and its default path (11 calls); 1 test call supply it |
| `VirtualList.#0.rangeExtractor` | `ui/src/primitives/virtual-list/virtual-list.tsx:96` | unsupplied-prop | delete | delete the prop and its default path (11 calls); 1 test call supply it |
| `VirtualList.#0.scrollToIndex` | `ui/src/primitives/virtual-list/virtual-list.tsx:96` | unsupplied-prop | delete | delete the prop and its default path (11 calls); 1 test call supply it |
| `VirtualList.#0.initialScrollOffset` | `ui/src/primitives/virtual-list/virtual-list.tsx:96` | unsupplied-prop | delete | delete the prop and its default path (11 calls); 1 test call supply it |
| `StreamShimmer.#0.className` | `ui/src/stream/shimmer.tsx:13` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `TypingDots.#0.className` | `ui/src/stream/typing-dots.tsx:17` | unsupplied-prop | delete | delete the prop and its default path (1 call) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired params` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
