---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the kit shapes the unwired shapes scan reports

## What

`pnpm unwired shapes` reports each of the shapes below in `kit`; `reports/unwired/shapes.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Shape | At | Kind | Class | Decision |
| - | - | - | - | - |
| `ChunkParams` / `ChunkParamsWire` | `kit/src/chunk/index.ts:18` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `contracts/src/databank/index.ts:143`; a shape that matches by coincidence stays |
| `Span` / `BoxSpan` | `kit/src/chunk/split.ts:18` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `kit/src/image-sniff/index.ts:358`; a shape that matches by coincidence stays |
| `Span` / `PinnedSpan` | `kit/src/chunk/split.ts:18` | restated | unknown (read) | a `{ start, end }` range: fold the character ranges into kit's `Span`; byte, box and pixel spans are other concepts and stay |
| `Span` / `Range` | `kit/src/chunk/split.ts:18` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `ui/src/markdown/dialogue.ts:45`; a shape that matches by coincidence stays |
| `Span` / `HighlightedTextRange` | `kit/src/chunk/split.ts:18` | restated | delete (read) | both are a half-open character range: import kit's `Span` in the highlighted-text primitive |
| `Span` / `HiddenRun` | `kit/src/chunk/split.ts:18` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `kit/src/content/index.ts:320`; a shape that matches by coincidence stays |
| `HiddenRun` / `Span` | `kit/src/content/index.ts:320` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `kit/src/chunk/split.ts:18`; a shape that matches by coincidence stays |
| `HiddenRun` / `BoxSpan` | `kit/src/content/index.ts:320` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `kit/src/image-sniff/index.ts:358`; a shape that matches by coincidence stays |
| `HiddenRun` / `PinnedSpan` | `kit/src/content/index.ts:320` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `ui/src/primitives/message-list/pin-spacer.ts:19`; a shape that matches by coincidence stays |
| `HiddenRun` / `Range` | `kit/src/content/index.ts:320` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `ui/src/markdown/dialogue.ts:45`; a shape that matches by coincidence stays |
| `HiddenRun` / `HighlightedTextRange` | `kit/src/content/index.ts:320` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `ui/src/primitives/highlighted-text/highlighted-text.tsx:7`; a shape that matches by coincidence stays |
| `BoxSpan` / `PinnedSpan` | `kit/src/image-sniff/index.ts:358` | restated | unknown (read) | a `{ start, end }` range: fold the character ranges into kit's `Span`; byte, box and pixel spans are other concepts and stay |
| `BoxSpan` / `Range` | `kit/src/image-sniff/index.ts:358` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `ui/src/markdown/dialogue.ts:45`; a shape that matches by coincidence stays |
| `BoxSpan` / `HighlightedTextRange` | `kit/src/image-sniff/index.ts:358` | restated | unknown (read) | a `{ start, end }` range: fold the character ranges into kit's `Span`; byte, box and pixel spans are other concepts and stay |
| `RowPersonaName` / `JoinerPersona` | `kit/src/macro/row-macros.ts:40` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `contracts/src/persona/schemas.ts:88`; a shape that matches by coincidence stays |
| `RowPersonaName` / `BookDetailsPatch` | `kit/src/macro/row-macros.ts:40` | restated | unknown (read) | a persona name stamp and a book patch match by coincidence: keep both |
| `TextNode` / `HastText` | `kit/src/macro/types.ts:9` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `ui/src/markdown/reveal-plugin.ts:25`; a shape that matches by coincidence stays |
| `GlobalVarWrite` / `PluginBoundKeyValueRow` | `kit/src/macro/types.ts:241` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `contracts/src/plugin/ui.ts:1328`; a shape that matches by coincidence stays |
| `UserMacroInputOption` / `PluginSelectOption` | `kit/src/macro/user-macros.ts:44` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `contracts/src/plugin/ui.ts:564`; a shape that matches by coincidence stays |
| `UserMacroInputOption` / `ConfigSettingOption` | `kit/src/macro/user-macros.ts:44` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/state/config-group-registry.ts:78`; a shape that matches by coincidence stays |
| `UserMacroInputOption` / `ParamToggleOption` | `kit/src/macro/user-macros.ts:44` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/features/discovery/components/corpus-controls.tsx:44`; a shape that matches by coincidence stays |
| `UserMacroInputOption` / `ToggleItem` | `kit/src/macro/user-macros.ts:44` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/features/preset/lib/assembly-model.ts:142`; a shape that matches by coincidence stays |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired shapes` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
