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

22 rows: applied 2, kept 20, handed off 0, owner question 0. Scan: ast-grep inline rule (identifier, type_identifier, property_identifier), `-l ts` and `-l tsx`, `packages tests` plus the per-statement import scanner over every ts and tsx file; `HighlightedTextRange` had 6 hits, all in its own file, so no importer needed a rename.

Applied (2): both are half-open character ranges, the concept kit's `Span` names ("an absolute half-open span into the original input text").

- `Span` / `HighlightedTextRange`: `HighlightedTextRange` is deleted; `ui/src/primitives/highlighted-text/highlighted-text.tsx` types its `ranges` as `Span` from `@orb/kit/chunk`.
- `Span` / `Range`: the private `Range` in `ui/src/markdown/dialogue.ts` (char offsets into a part's text) is replaced by `Span`.
- `kit/src/chunk/index.ts` now exports the type `Span` (its placeholder `export {} from "./split.ts"` is replaced); `Span` has two real consumers now.

Kept (20):

- `ChunkParams` / `ChunkParamsWire`: deliberate. `contracts/src/databank/index.ts` pins the zod wire twin to the kit shape with a compile-time mutual-assignability check; kit stays zod-free. The pair is the kit-versus-wire seam, not a stray copy.
- Byte, box and pixel ranges stay other concepts, as the item states: `Span` / `BoxSpan` (box payload bytes in `kit/src/image-sniff`), `Span` / `PinnedSpan` (message-list pin spacer, pixels), `Span` / `HiddenRun`, and every `HiddenRun`, `BoxSpan` and `PinnedSpan` pairing with the others (rows 6 to 14). `HiddenRun`'s own doc calls it a byte range of the registered hidden tag, scanned blind to code blocks. After the two merges above, the `Range` and `HighlightedTextRange` rows of these pairings read as `Span` and stay for the same reason.
- `RowPersonaName` / `JoinerPersona`: a macro-render stamp (name and description for `{{persona}}`) versus the room joiner's persona wire; kit may not import contracts and the two change for different reasons.
- `RowPersonaName` / `BookDetailsPatch`: coincidence, as the item states.
- `TextNode` / `HastText`: the macro AST's text node and the markdown plugin's structural hast text node; `ui` carries no kit macro dependency for a hast walker.
- `GlobalVarWrite` / `PluginBoundKeyValueRow`: a macro global write op and a plugin UI row (the plugin side is under `packages/contracts/src/plugin/`, which stays).
- `UserMacroInputOption` / `PluginSelectOption`, `ConfigSettingOption`, `ParamToggleOption`, `ToggleItem` (4 rows): a bare `{ label, value }` pair is not a concept; each types its own control (user-macro inputs, plugin select, config leaf, toggles).

Commands: `pnpm typecheck packages/kit/tsconfig.json packages/ui/tsconfig.json packages/client/tsconfig.json tsconfig.tests-dom.json` exit 0; `pnpm lint:eslint` on the touched paths exit 0; `pnpm depcruise` exit 0. No suite covers `dialogue.ts` or the highlighted-text types beyond the typecheck.

- The distinct ledger `tooling/src/unwired/distinct-lookalikes.ts` drops the `HighlightedTextRange` pair and records `PinnedSpan` against `Span` and `HiddenRun`; `pnpm test:tools tests/tooling/unwired` exit 0.
