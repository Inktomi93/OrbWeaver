---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: client
plan: cross-surface-consistency
---

# Move hand-built horizontal form rows onto the settings row template

## What

Item 1489 left FieldLayout orientation="horizontal" rows in preset-structure-tabs.tsx, message-handling-section.tsx, character-appearance-tab.tsx, character-facet-editor.tsx and chat-attachment-quality-section.tsx. Move each onto SettingRowGroup and SettingRow, or rule it an editor form row with the reason.

## Why

Acceptance judges settings and editor families for one track geometry.

## Done when

Each site is moved or ruled in this item's Evidence, and before and after captures show the track geometry.

## Evidence

### Rulings

Every site is a settings row (a label, a control and an optional hint in the settings track). None is ruled an editor form row.

| Site | Ruling |
| - | - |
| `packages/client/src/features/preset/components/preset-structure-tabs.tsx` | Moved. Delivery, Inline reasoning parsing and Post-processing each hold a `SettingRowGroup` with one `SettingTrackRow` per field. |
| `packages/client/src/features/preset/components/message-handling-section.tsx` | Moved. The merging row keeps its floor notes under the select, inside the control column; it is still one label, one control and one hint. |
| `packages/client/src/features/character/components/character-appearance-tab.tsx` | Moved. Each colour and select cluster holds a `SettingRowGroup`. The tab-level `FieldLayout` is gone: `BackgroundSourceField`, the header actions and the preview are not `Field` rows. |
| `packages/client/src/features/character/components/character-facet-editor.tsx` | Moved. Creator and Card version are `SettingTrackRow`s. The other facets are full-width macro fields and were never horizontal. |
| `packages/client/src/features/chat/components/chat-attachment-quality-section.tsx` | Moved. The hand-built `settingTrack` grid with two subgrid wrappers is a nested `SettingRowGroup` with two `SettingTrackRow`s inside the `span` `SettingRow`. |

### Lint

`orb/page-template-shapes` now refuses a `FieldLayout` with `orientation="horizontal"` in `packages/client/src/features/**`. The signature is precise: after the moves the only horizontal `FieldLayout`s are the two inside `packages/client/src/components/setting-row-group.tsx` and `packages/client/src/components/setting-teach-row.tsx`, which the rule does not cover. An `ast-grep` scan of `packages/client/src` found no other `FieldLayout` element (`tsx`: 844 files, `ts`: 818 files). The planted case and the pass cases are in `tests/tooling/eslint-page-template-shapes.test.ts`. The case failed before the selector and passes after.

### Captures

Before is the parent commit's isolated stage, `--ref 2584846c67`. After is `--dirty` on this tree. Both ran at desktop (1280 wide) and phone (`--mobile`). Preset editor Transforms and Settings Chat behavior ran through `pnpm snap`; its run slots are under `reports/runs/snap/` (`lane1519-<before|after>-<desktop|phone>-<presets|settings>.png`). The stage has no characters, so the Look tab and the Provenance facet were captured in the CT browser on the production shell (the throwaway probe is not committed; its images and `geometry-*.json` are in the lane scratchpad `lane1519-shots/before` and `lane1519-shots/after`).

Control x is relative to the captured pane; the settings pane reference is Chat behavior, whose control edge is 210 with a 202 wide control at desktop.

| Surface | Desktop before | Desktop after | Phone before and after | Reason |
| - | - | - | - | - |
| Preset editor Transforms | control x 320, width 200, docked at the pane's right edge | control x 210, width 202, one shared edge | label over control, control 382 wide, x 0 | The old row was a flex `justify-between` against the pane. The track packs the control next to the label and matches the settings pane edge. The 2px width and the 210 against 212 are the field subgrid's own 8px gap, the same in the settings pane. |
| Character Provenance facet | control x 320, width 200 | control x 210, width 202 | label over control, control 342 wide, x 0 | Same as Transforms. |
| Character Look tab (colour and select rows) | stacked, row 56 tall, control 367 wide | identical | stacked, row 68 tall, control 373 wide | The docked panel is under the 448px fold of the old row, and under the 512px track step. A panel between those widths now stacks where the old row sat side by side; that is the settings pane's own step. |
| Settings Chat behavior, attachment quality | control x 210, width 202 | identical | stacked, control 382 wide | The old hand-built grid already used the track; the move removes the duplicate grid. |

### Checks

- `tests/client/features/preset/components/platform-preset-transforms-track.suite.ct.tsx` mounts the production preset editor on Transforms. It asserts one label edge, one control edge in every group, the group's laid-out label track equal to the resolved `--width-control-col` token, and the stacked arm below the track step. It failed on the old source (no `setting-row-group` rendered) and passes on Chromium and WebKit at both widths.
- Affected CTs on Chromium: `tests/client/features/app-shell/surface-census.suite.ct.tsx`, `tests/client/features/app-shell/form-identity.suite.ct.tsx`, `tests/client/features/character/components/platform-context-recovery.suite.ct.tsx`, `tests/client/features/preset/components/platform-preset-pivot-focus.suite.ct.tsx`. On WebKit: the two platform suites. All passed.
- On the tree with main merged: `pnpm typecheck packages/client/tsconfig.json tsconfig.tests-dom.json`, `pnpm lint`, `pnpm lint:eslint packages tooling tests`, `pnpm depcruise` and `pnpm knip:prod` all passed.
- `pnpm test:tools tests/tooling/eslint-page-template-shapes.test.ts` passed.
