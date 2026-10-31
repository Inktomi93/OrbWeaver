---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the ui fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `ui`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `WeaveGlyphOwnProps.className` | `ui/src/art/web-weave/weave-glyph.tsx:21` | never-written | delete | delete the field and the branch that reads its default at `ui/src/art/web-weave/weave-glyph.tsx:40` |
| `WeaveDewDrop.x` | `ui/src/art/web-weave/web-weave-geometry.ts:52` | never-read | delete | delete the field and its writes (`ui/src/art/web-weave/web-weave-geometry.ts:376`) and the 1 test reference |
| `WeaveDewDrop.y` | `ui/src/art/web-weave/web-weave-geometry.ts:53` | never-read | delete | delete the field and its writes (`ui/src/art/web-weave/web-weave-geometry.ts:377`) and the 1 test reference |
| `WovenWeb.reach` | `ui/src/art/web-weave/web-weave-geometry.ts:80` | never-read | delete | delete the field and its writes (`ui/src/art/web-weave/web-weave-geometry.ts:420`) |
| `WovenWeb.freeZoneRadius` | `ui/src/art/web-weave/web-weave-geometry.ts:81` | never-read | delete | delete the field and its writes (`ui/src/art/web-weave/web-weave-geometry.ts:420`) and the 1 test reference |
| `WeavePalette.spiderBody` | `ui/src/art/web-weave/web-weave-render.ts:32` | never-read | delete | delete the field and its writes (`ui/src/art/web-weave/web-weave.tsx:150`) |
| `WeavePalette.spiderBand` | `ui/src/art/web-weave/web-weave-render.ts:33` | never-read | delete | delete the field and its writes (`ui/src/art/web-weave/web-weave.tsx:151`) |
| `WeaveFrameInput.dt` | `ui/src/art/web-weave/web-weave-render.ts:54` | never-read | delete | delete the field and its writes (`ui/src/art/web-weave/web-weave.tsx:311`) |
| `WeaveFrameInput.prey` | `ui/src/art/web-weave/web-weave-render.ts:58` | never-read | delete | delete the field and its writes (`ui/src/art/web-weave/web-weave.tsx:313`) |
| `BarListItem.id` | `ui/src/charts/bar-list/option.ts:18` | unreferenced | delete | delete the field and the 2 test references |
| `ChartEvent.seriesIndex` | `ui/src/charts/chart/contract.ts:5` | unreferenced | delete | delete the field |
| `ChartEvent.dataIndex` | `ui/src/charts/chart/contract.ts:6` | unreferenced | delete | delete the field |
| `bubble.fg` | `ui/src/content/theme-scope/clamp.ts:73` | unreferenced | delete | delete the key |
| `themeScopeTokensSchema.font` | `ui/src/content/theme-scope/clamp.ts:87` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `ui/src/content/theme-scope/clamp.ts:484` |
| `themeScopeTokensSchema.radius` | `ui/src/content/theme-scope/clamp.ts:88` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `ui/src/content/theme-scope/clamp.ts:490` |
| `themeScopeTokensSchema.density` | `ui/src/content/theme-scope/clamp.ts:91` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `ui/src/content/theme-scope/clamp.ts:499` |
| `ClampedTheme.color` | `ui/src/content/theme-scope/clamp.ts:124` | never-written | delete | delete the field and the branch that reads its default at `ui/src/content/theme-scope/theme-scope.tsx:98` |
| `CssMergeConflict.axis` | `ui/src/lib/css-merge-contract.ts:10` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `CssMergeConflict.loser` | `ui/src/lib/css-merge-contract.ts:11` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `CssMergeConflict.winner` | `ui/src/lib/css-merge-contract.ts:12` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `CssMergeReceipt.conflicts` | `ui/src/lib/css-merge-contract.ts:24` | never-read | delete | delete the field and its writes (`ui/src/lib/css-merge-trace.ts:155`) and the 5 test references |
| `CssMergeTraceState.enabled` | `ui/src/lib/css-merge-contract.ts:29` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `CssMergeTraceState.calls` | `ui/src/lib/css-merge-contract.ts:30` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `CssMergeTraceState.conflictCalls` | `ui/src/lib/css-merge-contract.ts:31` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `CssMergeTraceState.deduplicatedConflictCalls` | `ui/src/lib/css-merge-contract.ts:32` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `CssMergeTraceState.receipts` | `ui/src/lib/css-merge-contract.ts:33` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `LiveResolverRootElement.getPropertyValue` | `ui/src/lib/live-token-resolver.ts:26` | unreferenced | delete | delete the field |
| `LiveResolverProbeElement.style.color` | `ui/src/lib/live-token-resolver.ts:33` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `LiveResolverProbeElement.style.position` | `ui/src/lib/live-token-resolver.ts:33` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `LiveResolverProbeElement.style.paddingLeft` | `ui/src/lib/live-token-resolver.ts:33` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `LiveResolverPaintCanvas.width` | `ui/src/lib/live-token-resolver.ts:38` | never-read | delete | delete the field and its writes (`ui/src/lib/live-token-resolver.ts:149`) |
| `LiveResolverPaintCanvas.height` | `ui/src/lib/live-token-resolver.ts:39` | never-read | delete | delete the field and its writes (`ui/src/lib/live-token-resolver.ts:150`) |
| `LiveResolverObserverOptions.attributes` | `ui/src/lib/live-token-resolver.ts:52` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `LiveResolverObserverOptions.attributeFilter` | `ui/src/lib/live-token-resolver.ts:53` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `LiveResolverObserverOptions.childList` | `ui/src/lib/live-token-resolver.ts:54` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `MarkdownNode.value` | `ui/src/markdown/dice-inline.tsx:12` | never-read | delete | delete the field and its writes (`ui/src/markdown/dice-inline.tsx:43`) |
| `MarkdownNode.data` | `ui/src/markdown/dice-inline.tsx:15` | unreferenced | delete | delete the field |
| `MarkdownNode.data.hName` | `ui/src/markdown/dice-inline.tsx:15` | unreferenced | delete | delete the field |
| `MarkdownNode.data.hChildren` | `ui/src/markdown/dice-inline.tsx:15` | unreferenced | delete | delete the field |
| `DiceHastNode.type` | `ui/src/markdown/dice-inline.tsx:19` | unreferenced | delete | delete the field |
| `DiceHastNode.tagName` | `ui/src/markdown/dice-inline.tsx:20` | unreferenced | delete | delete the field |
| `DiceHastNode.properties` | `ui/src/markdown/dice-inline.tsx:21` | unreferenced | delete | delete the field |
| `DiceHastNode.children` | `ui/src/markdown/dice-inline.tsx:22` | unreferenced | delete | delete the field |
| `MarkdownToken.start.offset` | `ui/src/markdown/dice-inline.tsx:32` | unreferenced | delete | delete the field |
| `MarkdownToken.start.line` | `ui/src/markdown/dice-inline.tsx:32` | unreferenced | delete | delete the field |
| `MarkdownToken.start.column` | `ui/src/markdown/dice-inline.tsx:32` | unreferenced | delete | delete the field |
| `MarkdownToken.end.offset` | `ui/src/markdown/dice-inline.tsx:33` | unreferenced | delete | delete the field |
| `MarkdownToken.end.line` | `ui/src/markdown/dice-inline.tsx:33` | unreferenced | delete | delete the field |
| `MarkdownToken.end.column` | `ui/src/markdown/dice-inline.tsx:33` | unreferenced | delete | delete the field |
| `MarkdownCompilerExtension.enter` | `ui/src/markdown/dice-inline.tsx:57` | never-read | delete | delete the field and its writes (`ui/src/markdown/dice-inline.tsx:138`) |
| `HastElement.children` | `ui/src/markdown/reveal-plugin.ts:33` | never-read | delete | delete the field and its writes (`ui/src/markdown/reveal-plugin.ts:139`) |
| `ShikiHighlightToken.bgColor` | `ui/src/markdown/shiki-plugin.ts:24` | unreferenced | delete | delete the field |
| `ShikiHighlightToken.color` | `ui/src/markdown/shiki-plugin.ts:25` | unreferenced | delete | delete the field |
| `ShikiHighlightToken.content` | `ui/src/markdown/shiki-plugin.ts:26` | unreferenced | delete | delete the field |
| `ShikiHighlightToken.htmlAttrs` | `ui/src/markdown/shiki-plugin.ts:27` | unreferenced | delete | delete the field |
| `ShikiHighlightToken.htmlStyle` | `ui/src/markdown/shiki-plugin.ts:28` | unreferenced | delete | delete the field |
| `ShikiHighlightToken.offset` | `ui/src/markdown/shiki-plugin.ts:29` | unreferenced | delete | delete the field |
| `ShikiHighlightResult.bg` | `ui/src/markdown/shiki-plugin.ts:32` | unreferenced | delete | delete the field |
| `ShikiHighlightResult.fg` | `ui/src/markdown/shiki-plugin.ts:33` | unreferenced | delete | delete the field |
| `ShikiHighlightResult.rootStyle` | `ui/src/markdown/shiki-plugin.ts:34` | unreferenced | delete | delete the field |
| `ShikiHighlightResult.tokens` | `ui/src/markdown/shiki-plugin.ts:35` | unreferenced | delete | delete the field |
| `SelectOpeningObservation.event` | `ui/src/primitives/select/opening.ts:16` | never-read | delete | delete the field and its writes (`ui/src/primitives/select/opening.ts:33`) |
| `WebSpinnerOwnProps.className` | `ui/src/primitives/spinner/spinner.tsx:38` | never-written | delete | delete the field and the branch that reads its default at `ui/src/primitives/spinner/spinner.tsx:45` |
| `TableColumn.sortable` | `ui/src/primitives/table/table.tsx:28` | never-written | delete | delete the field and the branch that reads its default at `ui/src/primitives/table/table.tsx:174` |
| `TableColumn.width` | `ui/src/primitives/table/table.tsx:31` | never-written | delete | delete the field and the branch that reads its default at `ui/src/primitives/table/table.tsx:311` |
| `ToolCallBlockRecord.toolCallId` | `ui/src/primitives/tool-call-block/tool-call-block.tsx:9` | unreferenced | delete | delete the field |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
