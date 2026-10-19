# 989 batch: `@orb/ui`

## Outcome

356 of the 404 baseline rows of `packages/ui` are classified; 48 rows in files of open lanes are listed and left alone. 23 rows leave the baseline: 20 door edges removed and 3 declarations unexported. 17 judged rows and 316 rule-retained rows stay. Production Knip reports these 23 keys stale and no new finding. The contracts batch is in `reports/review/989-batch-contracts.md`.

## Production roots and consumer scope

- Roots: production Knip (`pnpm knip:prod`, `includeEntryExports`) with every `@orb/ui` subpath in `packages/ui/package.json` as an entry. The consumers are `client` and the ui package itself.
- Not consumers: `tests/**`, `tests/support` and `tooling` (Knip ignores them in production mode). A test importer is evidence, never liveness.
- Excluded from action: `packages/ui/src/art/web-weave/**` (the 1075 lane moves a web-weave legacy probe), `packages/ui/src/tokens/**` (the 1078 lane), and the generated-token files `packages/ui/token-contract.ts` and `packages/ui/tokens.build.ts`.

## Method

- Rows and buckets: `node scripts/triage-production-exports.ts packages/ui` on the base tree (`aeebf6cd5f`). It scanned 8830 TS, 1654 TSX and 181 JS tracked files.
- Callers: `codegraph callers` for `ICON_LG`, `ICON_MD` and `ICON_SM` showed only `icon.tsx` and the barrel. `rg --word-regexp` over the tracked tree for every judged or candidate name; the other hits are comments.
- Door edges: removed through `scripts/codemods/production-exports-989.ts` with the workset adapter. One module request, `./waystone-geometry.ts` in the meter barrel, was left empty and is deleted: `waystone.tsx`, exported from the same barrel, value-imports that module, so evaluation is unchanged.
- Legacy importers of a removed edge now import the origin through the root `#ui/*` map. No case changed.

## Forks

- F1, test-anchored exports: the same fork as the contracts batch. The Waystone treatment functions have a real door, `resolveWaystoneTreatment`, but the legacy matrix test calls them at 88 sites, so moving it is a retrofit.
- F2, `ActionBar` (`packages/ui/src/layout/action-bar.tsx`): an `@orb/ui` primitive with no application consumer and no PREBUILT contract. My default: keep it until the owner says wire or delete.
- `WAYSTONE_WEATHERS` is an alias of `WEATHER_TYPES` that only a legacy test reads. Deleting it needs an edit to the `packages/kit/src/weather/index.ts` header, a kit door; it waits for the 1075 lane.

## Removed, unexported or deleted (23)

| Row | Class | Action | Evidence |
| - | - | - | - |
| `packages/ui/src/charts/meter/index.ts#WAYSTONE_PHASE_SPANS` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | legacyTests 1 (tests/legacy/ui/charts/meter/waystone-treatment.dom.test.ts:16); Knip reports the key stale |
| `packages/ui/src/charts/meter/index.ts#WAYSTONE_SKY_STOPS` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | legacyTests 1 (tests/legacy/ui/charts/meter/waystone-treatment.dom.test.ts:16); Knip reports the key stale |
| `packages/ui/src/charts/meter/index.ts#WAYSTONE_WEATHERS` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | legacyTests 1 (tests/legacy/ui/charts/meter/waystone-treatment.dom.test.ts:16); Knip reports the key stale |
| `packages/ui/src/charts/meter/index.ts#handAngle` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | legacyTests 1 (tests/legacy/ui/charts/meter/waystone-treatment.dom.test.ts:16); Knip reports the key stale |
| `packages/ui/src/charts/meter/index.ts#hourAngle` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | legacyTests 1 (tests/legacy/ui/charts/meter/waystone-treatment.dom.test.ts:16); Knip reports the key stale |
| `packages/ui/src/charts/meter/index.ts#resolveWaystoneTreatment` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | legacyTests 1 (tests/legacy/ui/charts/meter/waystone-treatment.dom.test.ts:16); Knip reports the key stale |
| `packages/ui/src/charts/meter/index.ts#waystoneBandTint` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | legacyTests 1 (tests/legacy/ui/charts/meter/waystone-treatment.dom.test.ts:16); Knip reports the key stale |
| `packages/ui/src/charts/meter/index.ts#waystoneCelestialAt` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | legacyTests 1 (tests/legacy/ui/charts/meter/waystone-treatment.dom.test.ts:16); Knip reports the key stale |
| `packages/ui/src/charts/meter/index.ts#waystonePhaseAtHour` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | legacyTests 1 (tests/legacy/ui/charts/meter/waystone-treatment.dom.test.ts:16); Knip reports the key stale |
| `packages/ui/src/charts/meter/index.ts#waystoneSkyAt` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | legacyTests 1 (tests/legacy/ui/charts/meter/waystone-treatment.dom.test.ts:16); Knip reports the key stale |
| `packages/ui/src/charts/meter/index.ts#waystoneStarOpacityAt` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | legacyTests 1 (tests/legacy/ui/charts/meter/waystone-treatment.dom.test.ts:16); Knip reports the key stale |
| `packages/ui/src/charts/meter/index.ts#waystoneWeatherRecipe` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | legacyTests 1 (tests/legacy/ui/charts/meter/waystone-treatment.dom.test.ts:16); Knip reports the key stale |
| `packages/ui/src/content/theme-scope/index.ts#THEME_SCOPE_DENSITIES` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | legacyTests 1 (tests/legacy/contracts/theme/pairing.suite.test.ts:9); Knip reports the key stale |
| `packages/ui/src/content/theme-scope/index.ts#THEME_SCOPE_RADII` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | legacyTests 1 (tests/legacy/contracts/theme/pairing.suite.test.ts:9); Knip reports the key stale |
| `packages/ui/src/content/theme-scope/index.ts#themeScopeTokensSchema` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | legacyTests 1 (tests/legacy/contracts/theme/pairing.suite.test.ts:9); Knip reports the key stale |
| `packages/ui/src/lib/index.ts#CSS_MERGE_TRACE_INPUT_LIMIT` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | legacyTests 1 (tests/legacy/ui/lib/class-merge.test.ts:14); Knip reports the key stale |
| `packages/ui/src/primitives/icons/icon.tsx#ICON_LG` (exports) | used only in its own module | unexported | no importer; Knip reports the key stale |
| `packages/ui/src/primitives/icons/icon.tsx#ICON_MD` (exports) | used only in its own module | unexported | no importer; Knip reports the key stale |
| `packages/ui/src/primitives/icons/icon.tsx#ICON_SM` (exports) | used only in its own module | unexported | no importer; Knip reports the key stale |
| `packages/ui/src/primitives/icons/index.ts#ICON_LG` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | no importer; Knip reports the key stale |
| `packages/ui/src/primitives/icons/index.ts#ICON_MD` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | no importer; Knip reports the key stale |
| `packages/ui/src/primitives/icons/index.ts#ICON_SM` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | no importer; Knip reports the key stale |
| `packages/ui/src/primitives/button/index.ts#IconOnlyButtonSize` (types) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | legacyTests 1 (tests/legacy/ui/primitives/button/index.dom.test-d.ts:10); Knip reports the key stale |

## Judged and kept (17)

| Row | Class | Action | Evidence |
| - | - | - | - |
| `packages/ui/src/charts/meter/waystone-geometry.ts#hourAngle` (exports) | flag: legacy-test anchored function | keep until the rebuilt suite tests it through Waystone (fork F1) | legacyTests 1 (tests/legacy/ui/charts/meter/waystone-treatment.dom.test.ts:16) |
| `packages/ui/src/charts/meter/waystone-treatment.ts#WAYSTONE_SKY_STOPS` (exports) | retain: Spine-Testing §10 token table read by a legacy test | keep | legacyTests 1 (tests/legacy/ui/charts/meter/waystone-treatment.dom.test.ts:16) |
| `packages/ui/src/charts/meter/waystone-treatment.ts#WAYSTONE_WEATHERS` (exports) | flag: alias of WEATHER_TYPES read only by a legacy test | keep; delete after 1075 lands (it needs a kit/weather header edit) | legacyTests 1 (tests/legacy/ui/charts/meter/waystone-treatment.dom.test.ts:16) |
| `packages/ui/src/charts/meter/waystone-treatment.ts#waystoneCelestialAt` (exports) | flag: legacy-test anchored function; real door is resolveWaystoneTreatment | keep (fork F1) | legacyTests 1 (tests/legacy/ui/charts/meter/waystone-treatment.dom.test.ts:16) |
| `packages/ui/src/charts/meter/waystone-treatment.ts#waystoneSkyAt` (exports) | flag: legacy-test anchored function; real door is resolveWaystoneTreatment | keep (fork F1) | legacyTests 1 (tests/legacy/ui/charts/meter/waystone-treatment.dom.test.ts:16) |
| `packages/ui/src/charts/meter/waystone-treatment.ts#waystoneStarOpacityAt` (exports) | flag: legacy-test anchored function; real door is resolveWaystoneTreatment | keep (fork F1) | legacyTests 1 (tests/legacy/ui/charts/meter/waystone-treatment.dom.test.ts:16) |
| `packages/ui/src/charts/meter/waystone-treatment.ts#waystoneWeatherRecipe` (exports) | flag: legacy-test anchored function; real door is resolveWaystoneTreatment | keep (fork F1) | legacyTests 1 (tests/legacy/ui/charts/meter/waystone-treatment.dom.test.ts:16) |
| `packages/ui/src/content/theme-scope/clamp.ts#THEME_SCOPE_DENSITIES` (exports) | retain: Spine-Testing §10 vocabulary tuple read by a legacy test | keep | legacyTests 1 (tests/legacy/contracts/theme/pairing.suite.test.ts:9) |
| `packages/ui/src/content/theme-scope/clamp.ts#THEME_SCOPE_RADII` (exports) | retain: Spine-Testing §10 vocabulary tuple read by a legacy test | keep | legacyTests 1 (tests/legacy/contracts/theme/pairing.suite.test.ts:9) |
| `packages/ui/src/content/theme-scope/clamp.ts#themeScopeTokensSchema` (exports) | flag: schema read only by a legacy test | keep (fork F1) | legacyTests 1 (tests/legacy/contracts/theme/pairing.suite.test.ts:9) |
| `packages/ui/src/layout/action-bar.tsx#ActionBar` (exports) | flag: @orb/ui primitive with no application consumer and no PREBUILT contract | keep; owner decides wire or delete (fork F2) | legacyTests 1 (tests/legacy/ui/layout/action-bar.fixtures.tsx:1) |
| `packages/ui/src/lib/css-merge-trace.ts#CSS_MERGE_TRACE_INPUT_LIMIT` (exports) | retain: Spine-Testing §10 limit read by a legacy test | keep | legacyTests 1 (tests/legacy/ui/lib/class-merge.test.ts:14) |
| `packages/ui/src/primitives/icons/fillable.ts#Pause` (exports) | flag: icon with no application consumer; the icons header grows the set per consumer, and only a legacy fixture reads it | keep (fork F1) | legacyTests 1 (tests/legacy/ui/primitives/icons/icon.fixtures.tsx:5) |
| `packages/ui/src/primitives/icons/index.ts#Pause` (exports) | flag: icon with no application consumer; the icons header grows the set per consumer, and only a legacy fixture reads it | keep (fork F1) | legacyTests 1 (tests/legacy/ui/primitives/icons/icon.fixtures.tsx:5) |
| `packages/ui/src/primitives/status-chip/index.ts#StatusChip` (exports) | retain: deliberate API; PREBUILT[for:UI-Gates-and-Lessons.md §9b] header is its contract | keep | legacyTests 3 (tests/legacy/ui/lib/variant-attrs.ct.tsx:18, tests/legacy/ui/variant-arm-matrix.stories.tsx:47) |
| `packages/ui/src/primitives/status-chip/status-chip.tsx#StatusChip` (exports) | retain: deliberate API; PREBUILT[for:UI-Gates-and-Lessons.md §9b] header is its contract | keep | legacyTests 3 (tests/legacy/ui/lib/variant-attrs.ct.tsx:18, tests/legacy/ui/variant-arm-matrix.stories.tsx:47) |
| `packages/ui/src/primitives/button/button.tsx#IconOnlyButtonSize` (types) | flag: type read only by a legacy type test | keep (fork F1) | legacyTests 1 (tests/legacy/ui/primitives/button/index.dom.test-d.ts:10) |

## Kept by a merged triage retention rule (316)

| Row | Rule |
| - | - |
| `packages/ui/src/charts/meter/index.ts#WAYSTONE_PHASES` (exports) | as const tuple behind a derived union (packages/ui/src/charts/meter/waystone-treatment.ts:34) |
| `packages/ui/src/charts/meter/waystone-treatment.ts#WAYSTONE_PHASES` (exports) | as const tuple behind a derived union (packages/ui/src/charts/meter/waystone-treatment.ts:34) |
| `packages/ui/src/content/theme-scope/clamp.ts#THEME_FONT_ALLOWLIST` (exports) | as const tuple behind a derived union (packages/ui/src/content/theme-scope/clamp.ts:40) |
| `packages/ui/src/content/theme-scope/index.ts#THEME_FONT_ALLOWLIST` (exports) | as const tuple behind a derived union (packages/ui/src/content/theme-scope/clamp.ts:40) |
| `packages/ui/src/layout/index.ts#ToolbarButton` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:3939) |
| `packages/ui/src/layout/index.ts#ToolbarGroup` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:3950) |
| `packages/ui/src/layout/index.ts#ToolbarInput` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:3961) |
| `packages/ui/src/layout/index.ts#ToolbarLink` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:3972) |
| `packages/ui/src/layout/index.ts#ToolbarSeparator` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:4005) |
| `packages/ui/src/layout/toolbar.tsx#ToolbarButton` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:3939) |
| `packages/ui/src/layout/toolbar.tsx#ToolbarGroup` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:3950) |
| `packages/ui/src/layout/toolbar.tsx#ToolbarInput` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:3961) |
| `packages/ui/src/layout/toolbar.tsx#ToolbarLink` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:3972) |
| `packages/ui/src/layout/toolbar.tsx#ToolbarSeparator` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:4005) |
| `packages/ui/src/lib/class-merge.ts#CSS_MERGE_FAMILY_NAMES` (exports) | imported by a rebuilt test or the testkit |
| `packages/ui/src/lib/index.ts#CSS_MERGE_FAMILY_NAMES` (exports) | imported by a rebuilt test or the testkit |
| `packages/ui/src/lib/index.ts#GAP_TOKENS` (exports) | as const tuple behind a derived union (packages/ui/src/lib/virtual-gap.ts:12) |
| `packages/ui/src/lib/index.ts#STAMPED_VARIANT_AXES` (exports) | imported by a rebuilt test or the testkit; as const tuple behind a derived union (packages/ui/src/lib/variant-attrs.ts:42); name read by tooling, scripts or root config (tooling/src/ui-audit/ops/walker/target-identity.ts:17) |
| `packages/ui/src/lib/variant-attrs.ts#STAMPED_VARIANT_AXES` (exports) | imported by a rebuilt test or the testkit; as const tuple behind a derived union (packages/ui/src/lib/variant-attrs.ts:42); name read by tooling, scripts or root config (tooling/src/ui-audit/ops/walker/target-identity.ts:17) |
| `packages/ui/src/lib/virtual-gap.ts#GAP_TOKENS` (exports) | as const tuple behind a derived union (packages/ui/src/lib/virtual-gap.ts:12) |
| `packages/ui/src/markdown/policy.ts#TIER_A_ELEMENTS` (exports) | named in law (docs/law/UI-Theming-and-Content.md) |
| `packages/ui/src/primitives/accordion/accordion.tsx#AccordionHeader` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:10) |
| `packages/ui/src/primitives/accordion/index.ts#AccordionHeader` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:10) |
| `packages/ui/src/primitives/alert-dialog/handle.ts#createAlertDialogHandle` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:97) |
| `packages/ui/src/primitives/alert-dialog/index.ts#createAlertDialogHandle` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:97) |
| `packages/ui/src/primitives/dialog/handle.ts#createDialogHandle` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:1383) |
| `packages/ui/src/primitives/dialog/index.ts#createDialogHandle` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:1383) |
| `packages/ui/src/primitives/drawer/drawer.tsx#DrawerDescription` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:1550) |
| `packages/ui/src/primitives/drawer/drawer.tsx#DrawerIndent` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:1572) |
| `packages/ui/src/primitives/drawer/drawer.tsx#DrawerIndentBackground` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:1583) |
| `packages/ui/src/primitives/drawer/drawer.tsx#DrawerProvider` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:1619) |
| `packages/ui/src/primitives/drawer/drawer.tsx#DrawerSwipeArea` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:1663) |
| `packages/ui/src/primitives/drawer/drawer.tsx#DrawerTrigger` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:1685) |
| `packages/ui/src/primitives/drawer/handle.ts#createDrawerHandle` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:1539) |
| `packages/ui/src/primitives/drawer/index.ts#DrawerDescription` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:1550) |
| `packages/ui/src/primitives/drawer/index.ts#DrawerIndent` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:1572) |
| `packages/ui/src/primitives/drawer/index.ts#DrawerIndentBackground` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:1583) |
| `packages/ui/src/primitives/drawer/index.ts#DrawerProvider` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:1619) |
| `packages/ui/src/primitives/drawer/index.ts#DrawerSwipeArea` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:1663) |
| `packages/ui/src/primitives/drawer/index.ts#DrawerTrigger` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:1685) |
| `packages/ui/src/primitives/drawer/index.ts#createDrawerHandle` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:1539) |
| `packages/ui/src/primitives/field/field.tsx#FieldValidity` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:1794) |
| `packages/ui/src/primitives/field/index.ts#FieldValidity` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:1794) |
| `packages/ui/src/primitives/media-tile-grid/aspect.ts#MEDIA_TILE_ASPECTS` (exports) | as const tuple behind a derived union (packages/ui/src/primitives/media-tile-grid/aspect.ts:9) |
| `packages/ui/src/primitives/media-tile-grid/index.ts#MEDIA_TILE_ASPECTS` (exports) | as const tuple behind a derived union (packages/ui/src/primitives/media-tile-grid/aspect.ts:9) |
| `packages/ui/src/primitives/menu/handle.ts#createMenuHandle` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:1936) |
| `packages/ui/src/primitives/menu/index.ts#MenuArrow` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:1093) |
| `packages/ui/src/primitives/menu/index.ts#MenuBackdrop` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:1104) |
| `packages/ui/src/primitives/menu/index.ts#MenuCheckboxItem` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:1115) |
| `packages/ui/src/primitives/menu/index.ts#MenuRadioGroup` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:1231) |
| `packages/ui/src/primitives/menu/index.ts#MenuRadioItem` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:1244) |
| `packages/ui/src/primitives/menu/index.ts#MenuViewport` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:2176); named in law (docs/law/ui-package-design.md) |
| `packages/ui/src/primitives/menu/index.ts#createMenuHandle` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:1936) |
| `packages/ui/src/primitives/menu/menu.tsx#MenuArrow` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:1093) |
| `packages/ui/src/primitives/menu/menu.tsx#MenuBackdrop` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:1104) |
| `packages/ui/src/primitives/menu/menu.tsx#MenuCheckboxItem` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:1115) |
| `packages/ui/src/primitives/menu/menu.tsx#MenuRadioGroup` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:1231) |
| `packages/ui/src/primitives/menu/menu.tsx#MenuRadioItem` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:1244) |
| `packages/ui/src/primitives/menu/menu.tsx#MenuViewport` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:2176); named in law (docs/law/ui-package-design.md) |
| `packages/ui/src/primitives/picker-cell/index.ts#PickerCell` (exports) | name read by tooling, scripts or root config (tooling/src/snap/ops/appearance-density-persistence.ts:134) |
| `packages/ui/src/primitives/popover/handle.ts#createPopoverHandle` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:2646) |
| `packages/ui/src/primitives/popover/index.ts#PopoverArrow` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:2613) |
| `packages/ui/src/primitives/popover/index.ts#PopoverDescription` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:2657) |
| `packages/ui/src/primitives/popover/index.ts#PopoverViewport` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:2777); named in law (docs/law/ui-package-design.md) |
| `packages/ui/src/primitives/popover/index.ts#createPopoverHandle` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:2646) |
| `packages/ui/src/primitives/popover/popover.tsx#PopoverArrow` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:2613) |
| `packages/ui/src/primitives/popover/popover.tsx#PopoverDescription` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:2657) |
| `packages/ui/src/primitives/popover/popover.tsx#PopoverViewport` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:2777); named in law (docs/law/ui-package-design.md) |
| `packages/ui/src/primitives/tooltip/handle.ts#createTooltipHandle` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:4033) |
| `packages/ui/src/primitives/tooltip/index.ts#TooltipArrow` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:4022) |
| `packages/ui/src/primitives/tooltip/index.ts#TooltipViewport` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:4152); named in law (docs/law/ui-package-design.md) |
| `packages/ui/src/primitives/tooltip/index.ts#createTooltipHandle` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:4033) |
| `packages/ui/src/primitives/tooltip/tooltip.tsx#TooltipArrow` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:4022) |
| `packages/ui/src/primitives/tooltip/tooltip.tsx#TooltipViewport` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:4152); named in law (docs/law/ui-package-design.md) |
| `packages/ui/src/stream/index.ts#StreamText` (exports) | name read by tooling, scripts or root config (packages/ui/src/stream/index.ts:1) |
| `packages/ui/src/stream/stream-text.tsx#StreamText` (exports) | name read by tooling, scripts or root config (packages/ui/src/stream/index.ts:1) |
| `packages/ui/src/art/art-bleed/index.ts#ArtBleedProps` (types) | type used in an exported signature (packages/ui/src/art/art-bleed/art-bleed.tsx:45) |
| `packages/ui/src/charts/bar-list/bar-list.tsx#BarListIntent` (types) | derived union of an as const tuple; type used in an exported signature (packages/ui/src/charts/bar-list/option.ts:44) |
| `packages/ui/src/charts/bar-list/index.ts#BarListIntent` (types) | derived union of an as const tuple; type used in an exported signature (packages/ui/src/charts/bar-list/option.ts:44) |
| `packages/ui/src/charts/bar-list/index.ts#BarListProps` (types) | type used in an exported signature (packages/ui/src/charts/bar-list/bar-list.tsx:58) |
| `packages/ui/src/charts/chart/index.ts#ChartProps` (types) | type used in an exported signature (packages/ui/src/charts/chart/chart.tsx:40) |
| `packages/ui/src/charts/chart/index.ts#OrbChartOption` (types) | type used in an exported signature (packages/ui/src/charts/histogram/option.ts:14); name read by tooling, scripts or root config (tooling/src/verify/gates/no-vanity-alias.ts:359) |
| `packages/ui/src/charts/heatmap/index.ts#HeatmapProps` (types) | type used in an exported signature (packages/ui/src/charts/heatmap/heatmap.tsx:40) |
| `packages/ui/src/charts/histogram/index.ts#HistogramProps` (types) | type used in an exported signature (packages/ui/src/charts/histogram/histogram.tsx:40) |
| `packages/ui/src/charts/meter/index.ts#CoinFigureProps` (types) | type used in an exported signature (packages/ui/src/charts/meter/coin-figure.tsx:54) |
| `packages/ui/src/charts/meter/index.ts#MeterProps` (types) | type used in an exported signature (packages/ui/src/charts/meter/meter.tsx:166) |
| `packages/ui/src/charts/meter/index.ts#RingColor` (types) | type used in an exported signature (packages/ui/src/charts/meter/ring-gauge.tsx:33) |
| `packages/ui/src/charts/meter/index.ts#RingGaugeProps` (types) | type used in an exported signature (packages/ui/src/charts/meter/ring-gauge.tsx:68) |
| `packages/ui/src/charts/meter/index.ts#SegmentBarProps` (types) | type used in an exported signature (packages/ui/src/charts/meter/segment-bar.tsx:38) |
| `packages/ui/src/charts/meter/index.ts#SegmentedClockProps` (types) | type used in an exported signature (packages/ui/src/charts/meter/segmented-clock.tsx:56) |
| `packages/ui/src/charts/meter/index.ts#TrackBarProps` (types) | type used in an exported signature (packages/ui/src/charts/meter/track-bar.tsx:67) |
| `packages/ui/src/charts/meter/index.ts#WaystoneClock` (types) | type used in an exported signature (packages/ui/src/charts/meter/waystone.tsx:90) |
| `packages/ui/src/charts/meter/index.ts#WaystoneParticleLayer` (types) | type used in an exported signature (packages/ui/src/charts/meter/waystone-treatment.ts:106) |
| `packages/ui/src/charts/meter/index.ts#WaystonePhase` (types) | derived union of an as const tuple; type used in an exported signature (packages/ui/src/charts/meter/waystone-treatment.ts:415) |
| `packages/ui/src/charts/meter/index.ts#WaystoneProps` (types) | type used in an exported signature (packages/ui/src/charts/meter/waystone.tsx:135) |
| `packages/ui/src/charts/meter/index.ts#WaystoneWeather` (types) | type used in an exported signature (packages/ui/src/charts/meter/waystone-treatment.ts:377) |
| `packages/ui/src/charts/meter/ring-gauge.tsx#RingColor` (types) | type used in an exported signature (packages/ui/src/charts/meter/ring-gauge.tsx:33) |
| `packages/ui/src/charts/meter/waystone-treatment.ts#WaystoneOverlayKind` (types) | derived union of an as const tuple; type used in an exported signature (packages/ui/src/charts/meter/waystone-treatment.ts:104) |
| `packages/ui/src/charts/meter/waystone-treatment.ts#WaystoneSky` (types) | type used in an exported signature (packages/ui/src/charts/meter/waystone-treatment.ts:116) |
| `packages/ui/src/charts/meter/waystone-treatment.ts#WaystoneWeatherRecipe` (types) | type used in an exported signature (packages/ui/src/charts/meter/waystone-treatment.ts:115) |
| `packages/ui/src/charts/meter/waystone.tsx#WaystoneClock` (types) | type used in an exported signature (packages/ui/src/charts/meter/waystone.tsx:90) |
| `packages/ui/src/charts/scatter/index.ts#ScatterProps` (types) | type used in an exported signature (packages/ui/src/charts/scatter/scatter.tsx:76) |
| `packages/ui/src/charts/stat-figure/index.ts#StatFigureDelta` (types) | type used in an exported signature (packages/ui/src/charts/stat-figure/stat-figure.tsx:21) |
| `packages/ui/src/charts/stat-figure/index.ts#StatFigureProps` (types) | type used in an exported signature (packages/ui/src/charts/stat-figure/stat-figure.tsx:42) |
| `packages/ui/src/charts/stat-figure/stat-figure.tsx#StatFigureDelta` (types) | type used in an exported signature (packages/ui/src/charts/stat-figure/stat-figure.tsx:21) |
| `packages/ui/src/content/immersive-card/index.ts#ImmersiveCardProps` (types) | type used in an exported signature (packages/ui/src/content/immersive-card/immersive-card.tsx:113) |
| `packages/ui/src/content/immersive-card/index.ts#InertCardProps` (types) | type used in an exported signature (packages/ui/src/content/immersive-card/inert-card.tsx:49) |
| `packages/ui/src/content/lightbox/index.ts#LightboxProps` (types) | type used in an exported signature (packages/ui/src/content/lightbox/lightbox.tsx:29) |
| `packages/ui/src/content/sandbox-frame/index.ts#SandboxFrameProps` (types) | type used in an exported signature (packages/ui/src/content/sandbox-frame/sandbox-frame.tsx:103) |
| `packages/ui/src/content/sandbox-frame/index.ts#SandboxThemeTokens` (types) | type used in an exported signature (packages/ui/src/content/sandbox-frame/use-sandbox-theme.ts:79) |
| `packages/ui/src/content/theme-scope/index.ts#ThemeScopeProps` (types) | type used in an exported signature (packages/ui/src/content/theme-scope/theme-scope.tsx:53) |
| `packages/ui/src/content/theme-swatch/index.ts#ThemeSwatchStripProps` (types) | type used in an exported signature (packages/ui/src/content/theme-swatch/theme-swatch.tsx:29) |
| `packages/ui/src/diff/index.ts#DiffViewProps` (types) | type used in an exported signature (packages/ui/src/diff/diff.tsx:41) |
| `packages/ui/src/fuzzy-search/index.ts#FuzzySearchOptions` (types) | type used in an exported signature (packages/ui/src/fuzzy-search/fuzzy-search.ts:72) |
| `packages/ui/src/layout/action-bar.tsx#ActionBarProps` (types) | type used in an exported signature (packages/ui/src/layout/action-bar.tsx:17) |
| `packages/ui/src/layout/index.ts#ContainerProps` (types) | type used in an exported signature (packages/ui/src/layout/container.tsx:13) |
| `packages/ui/src/layout/index.ts#GridProps` (types) | type used in an exported signature (packages/ui/src/layout/grid.tsx:23) |
| `packages/ui/src/layout/index.ts#InlineListProps` (types) | type used in an exported signature (packages/ui/src/layout/inline-list.tsx:8) |
| `packages/ui/src/layout/index.ts#RowProps` (types) | type used in an exported signature (packages/ui/src/layout/row.tsx:12) |
| `packages/ui/src/layout/index.ts#SectionProps` (types) | type used in an exported signature (packages/ui/src/layout/section.tsx:66) |
| `packages/ui/src/layout/index.ts#StackProps` (types) | type used in an exported signature (packages/ui/src/layout/stack.tsx:13) |
| `packages/ui/src/layout/index.ts#SurfaceProps` (types) | type used in an exported signature (packages/ui/src/layout/surface.tsx:41) |
| `packages/ui/src/layout/index.ts#SurfaceTier` (types) | type used in an exported signature (packages/ui/src/layout/surface.tsx:26) |
| `packages/ui/src/layout/index.ts#ToolbarButtonProps` (types) | type used in an exported signature (packages/ui/src/layout/toolbar.tsx:27) |
| `packages/ui/src/layout/index.ts#ToolbarGroupProps` (types) | type used in an exported signature (packages/ui/src/layout/toolbar.tsx:49) |
| `packages/ui/src/layout/index.ts#ToolbarInputProps` (types) | type used in an exported signature (packages/ui/src/layout/toolbar.tsx:76) |
| `packages/ui/src/layout/index.ts#ToolbarLinkProps` (types) | type used in an exported signature (packages/ui/src/layout/toolbar.tsx:62) |
| `packages/ui/src/layout/index.ts#ToolbarProps` (types) | type used in an exported signature (packages/ui/src/layout/toolbar.tsx:18) |
| `packages/ui/src/layout/index.ts#ToolbarSeparatorProps` (types) | type used in an exported signature (packages/ui/src/layout/toolbar.tsx:36) |
| `packages/ui/src/layout/surface.tsx#SurfaceTier` (types) | type used in an exported signature (packages/ui/src/layout/surface.tsx:26) |
| `packages/ui/src/layout/toolbar.tsx#ToolbarButtonProps` (types) | type used in an exported signature (packages/ui/src/layout/toolbar.tsx:27) |
| `packages/ui/src/layout/toolbar.tsx#ToolbarGroupProps` (types) | type used in an exported signature (packages/ui/src/layout/toolbar.tsx:49) |
| `packages/ui/src/layout/toolbar.tsx#ToolbarInputProps` (types) | type used in an exported signature (packages/ui/src/layout/toolbar.tsx:76) |
| `packages/ui/src/layout/toolbar.tsx#ToolbarLinkProps` (types) | type used in an exported signature (packages/ui/src/layout/toolbar.tsx:62) |
| `packages/ui/src/layout/toolbar.tsx#ToolbarSeparatorProps` (types) | type used in an exported signature (packages/ui/src/layout/toolbar.tsx:36) |
| `packages/ui/src/lib/css-merge-contract.ts#CssMergeTraceStatus` (types) | name read by tooling, scripts or root config (tooling/src/snap/contract/cascade.ts:3) |
| `packages/ui/src/lib/css-merge-contract.ts#CssMergeTraceStatuses` (types) | type used in an exported signature (packages/ui/src/lib/css-merge-contract.ts:38); name read by tooling, scripts or root config (tooling/src/snap/contract/cascade.ts:3) |
| `packages/ui/src/lib/index.ts#LiveTokenStore` (types) | type used in an exported signature (packages/ui/src/lib/live-token-resolver.ts:191) |
| `packages/ui/src/lib/index.ts#StampedVariantAxis` (types) | derived union of an as const tuple; type used in an exported signature (packages/ui/src/lib/variant-attrs.ts:45) |
| `packages/ui/src/lib/index.ts#VariantAxisAttrs` (types) | type used in an exported signature (packages/ui/src/lib/variant-attrs.ts:63) |
| `packages/ui/src/lib/index.ts#VariantAxisSource` (types) | type used in an exported signature (packages/ui/src/lib/variant-attrs.ts:58) |
| `packages/ui/src/lib/index.ts#VariantClassRecipe` (types) | type used in an exported signature (packages/ui/src/lib/variant-attrs.ts:105) |
| `packages/ui/src/lib/index.ts#VariantStampProps` (types) | type used in an exported signature (packages/ui/src/lib/variant-attrs.ts:105) |
| `packages/ui/src/lib/variant-attrs.ts#StampedVariantAxis` (types) | derived union of an as const tuple; type used in an exported signature (packages/ui/src/lib/variant-attrs.ts:45) |
| `packages/ui/src/markdown/index.ts#MarkdownProps` (types) | type used in an exported signature (packages/ui/src/markdown/markdown.tsx:152) |
| `packages/ui/src/primitives/accordion/accordion.tsx#AccordionHeaderProps` (types) | type used in an exported signature (packages/ui/src/primitives/accordion/accordion.tsx:36) |
| `packages/ui/src/primitives/accordion/index.ts#AccordionHeaderProps` (types) | type used in an exported signature (packages/ui/src/primitives/accordion/accordion.tsx:36) |
| `packages/ui/src/primitives/accordion/index.ts#AccordionItemProps` (types) | type used in an exported signature (packages/ui/src/primitives/accordion/accordion.tsx:28) |
| `packages/ui/src/primitives/accordion/index.ts#AccordionPanelProps` (types) | type used in an exported signature (packages/ui/src/primitives/accordion/accordion.tsx:59) |
| `packages/ui/src/primitives/accordion/index.ts#AccordionProps` (types) | type used in an exported signature (packages/ui/src/primitives/accordion/accordion.tsx:20) |
| `packages/ui/src/primitives/accordion/index.ts#AccordionTriggerProps` (types) | type used in an exported signature (packages/ui/src/primitives/accordion/accordion.tsx:45) |
| `packages/ui/src/primitives/alert-dialog/index.ts#AlertDialogActionsProps` (types) | type used in an exported signature (packages/ui/src/primitives/alert-dialog/alert-dialog.tsx:75) |
| `packages/ui/src/primitives/alert-dialog/index.ts#AlertDialogDescriptionProps` (types) | type used in an exported signature (packages/ui/src/primitives/alert-dialog/alert-dialog.tsx:65) |
| `packages/ui/src/primitives/alert-dialog/index.ts#AlertDialogPopupProps` (types) | type used in an exported signature (packages/ui/src/primitives/alert-dialog/alert-dialog.tsx:37) |
| `packages/ui/src/primitives/alert-dialog/index.ts#AlertDialogTitleProps` (types) | type used in an exported signature (packages/ui/src/primitives/alert-dialog/alert-dialog.tsx:56) |
| `packages/ui/src/primitives/aria-announcer/index.ts#AriaAnnouncerProps` (types) | type used in an exported signature (packages/ui/src/primitives/aria-announcer/aria-announcer.tsx:11) |
| `packages/ui/src/primitives/autocomplete/autocomplete.tsx#AutocompleteGroup` (types) | type used in an exported signature (packages/ui/src/primitives/autocomplete/autocomplete.tsx:52) |
| `packages/ui/src/primitives/autocomplete/index.ts#AutocompleteGroup` (types) | type used in an exported signature (packages/ui/src/primitives/autocomplete/autocomplete.tsx:52) |
| `packages/ui/src/primitives/autocomplete/index.ts#AutocompleteProps` (types) | imported by a rebuilt test or the testkit; type used in an exported signature (packages/ui/src/primitives/autocomplete/autocomplete.tsx:236) |
| `packages/ui/src/primitives/avatar-stack/index.ts#AvatarStackProps` (types) | type used in an exported signature (packages/ui/src/primitives/avatar-stack/avatar-stack.tsx:38) |
| `packages/ui/src/primitives/background-video/index.ts#BackgroundVideoProps` (types) | type used in an exported signature (packages/ui/src/primitives/background-video/background-video.tsx:44) |
| `packages/ui/src/primitives/card/index.ts#CardProps` (types) | type used in an exported signature (packages/ui/src/primitives/card/card.tsx:43) |
| `packages/ui/src/primitives/collapsible/index.ts#CollapsiblePanelProps` (types) | type used in an exported signature (packages/ui/src/primitives/collapsible/collapsible.tsx:64) |
| `packages/ui/src/primitives/collapsible/index.ts#CollapsibleProps` (types) | type used in an exported signature (packages/ui/src/primitives/collapsible/collapsible.tsx:18) |
| `packages/ui/src/primitives/collapsible/index.ts#CollapsibleTriggerProps` (types) | type used in an exported signature (packages/ui/src/primitives/collapsible/collapsible.tsx:38) |
| `packages/ui/src/primitives/color-field/index.ts#ColorFieldProps` (types) | type used in an exported signature (packages/ui/src/primitives/color-field/color-field.tsx:142) |
| `packages/ui/src/primitives/color-field/index.ts#ColorSwatchProps` (types) | type used in an exported signature (packages/ui/src/primitives/color-field/color-field.tsx:29) |
| `packages/ui/src/primitives/combobox/combobox.tsx#ComboboxGroup` (types) | type used in an exported signature (packages/ui/src/primitives/combobox/combobox.tsx:49); name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:265) |
| `packages/ui/src/primitives/combobox/index.ts#ComboboxGroup` (types) | type used in an exported signature (packages/ui/src/primitives/combobox/combobox.tsx:49); name read by tooling, scripts or root config (tooling/src/verify/gates/baseui-surface.manifest.json:265) |
| `packages/ui/src/primitives/combobox/index.ts#ComboboxProps` (types) | imported by a rebuilt test or the testkit; type used in an exported signature (packages/ui/src/primitives/combobox/combobox.tsx:129) |
| `packages/ui/src/primitives/command/index.ts#CommandAuxiliaryButtonProps` (types) | type used in an exported signature (packages/ui/src/primitives/command/command.tsx:154) |
| `packages/ui/src/primitives/command/index.ts#CommandEmptyProps` (types) | type used in an exported signature (packages/ui/src/primitives/command/command.tsx:176) |
| `packages/ui/src/primitives/command/index.ts#CommandGroupProps` (types) | type used in an exported signature (packages/ui/src/primitives/command/command.tsx:192) |
| `packages/ui/src/primitives/command/index.ts#CommandInputProps` (types) | type used in an exported signature (packages/ui/src/primitives/command/command.tsx:65) |
| `packages/ui/src/primitives/command/index.ts#CommandItemProps` (types) | type used in an exported signature (packages/ui/src/primitives/command/command.tsx:212) |
| `packages/ui/src/primitives/command/index.ts#CommandListProps` (types) | type used in an exported signature (packages/ui/src/primitives/command/command.tsx:139) |
| `packages/ui/src/primitives/command/index.ts#CommandLoadingProps` (types) | type used in an exported signature (packages/ui/src/primitives/command/command.tsx:220) |
| `packages/ui/src/primitives/command/index.ts#CommandProps` (types) | type used in an exported signature (packages/ui/src/primitives/command/command.tsx:39) |
| `packages/ui/src/primitives/compare-blocks/compare-blocks.tsx#CompareReview` (types) | type used in an exported signature (packages/ui/src/primitives/compare-blocks/compare-blocks.tsx:48) |
| `packages/ui/src/primitives/compare-blocks/index.ts#CompareBlocksProps` (types) | type used in an exported signature (packages/ui/src/primitives/compare-blocks/compare-blocks.tsx:250) |
| `packages/ui/src/primitives/compare-blocks/index.ts#CompareReview` (types) | type used in an exported signature (packages/ui/src/primitives/compare-blocks/compare-blocks.tsx:48) |
| `packages/ui/src/primitives/copy-button/index.ts#CopyButtonFallbackProps` (types) | type used in an exported signature (packages/ui/src/primitives/copy-button/copy-button.tsx:207) |
| `packages/ui/src/primitives/copy-button/index.ts#CopyButtonProps` (types) | type used in an exported signature (packages/ui/src/primitives/copy-button/copy-button.tsx:241) |
| `packages/ui/src/primitives/copy-button/index.ts#CopyButtonRootProps` (types) | type used in an exported signature (packages/ui/src/primitives/copy-button/copy-button.tsx:82) |
| `packages/ui/src/primitives/copy-button/index.ts#CopyButtonTriggerProps` (types) | type used in an exported signature (packages/ui/src/primitives/copy-button/copy-button.tsx:139) |
| `packages/ui/src/primitives/crossfade-image/index.ts#CrossfadeImageProps` (types) | type used in an exported signature (packages/ui/src/primitives/crossfade-image/crossfade-image.tsx:48) |
| `packages/ui/src/primitives/dialog/index.ts#DialogDescriptionProps` (types) | type used in an exported signature (packages/ui/src/primitives/dialog/dialog.tsx:69) |
| `packages/ui/src/primitives/dialog/index.ts#DialogFooterProps` (types) | type used in an exported signature (packages/ui/src/primitives/dialog/dialog.tsx:87) |
| `packages/ui/src/primitives/dialog/index.ts#DialogHeaderProps` (types) | type used in an exported signature (packages/ui/src/primitives/dialog/dialog.tsx:95) |
| `packages/ui/src/primitives/dialog/index.ts#DialogTitleProps` (types) | type used in an exported signature (packages/ui/src/primitives/dialog/dialog.tsx:60) |
| `packages/ui/src/primitives/drawer/drawer.tsx#DrawerDescriptionProps` (types) | type used in an exported signature (packages/ui/src/primitives/drawer/drawer.tsx:97) |
| `packages/ui/src/primitives/drawer/drawer.tsx#DrawerIndentBackgroundProps` (types) | type used in an exported signature (packages/ui/src/primitives/drawer/drawer.tsx:150) |
| `packages/ui/src/primitives/drawer/drawer.tsx#DrawerIndentProps` (types) | type used in an exported signature (packages/ui/src/primitives/drawer/drawer.tsx:137) |
| `packages/ui/src/primitives/drawer/drawer.tsx#DrawerSwipeAreaProps` (types) | type used in an exported signature (packages/ui/src/primitives/drawer/drawer.tsx:115) |
| `packages/ui/src/primitives/drawer/index.ts#DrawerDescriptionProps` (types) | type used in an exported signature (packages/ui/src/primitives/drawer/drawer.tsx:97) |
| `packages/ui/src/primitives/drawer/index.ts#DrawerIndentBackgroundProps` (types) | type used in an exported signature (packages/ui/src/primitives/drawer/drawer.tsx:150) |
| `packages/ui/src/primitives/drawer/index.ts#DrawerIndentProps` (types) | type used in an exported signature (packages/ui/src/primitives/drawer/drawer.tsx:137) |
| `packages/ui/src/primitives/drawer/index.ts#DrawerPopupProps` (types) | type used in an exported signature (packages/ui/src/primitives/drawer/drawer.tsx:62) |
| `packages/ui/src/primitives/drawer/index.ts#DrawerProps` (types) | type used in an exported signature (packages/ui/src/primitives/drawer/drawer.tsx:35) |
| `packages/ui/src/primitives/drawer/index.ts#DrawerSwipeAreaProps` (types) | type used in an exported signature (packages/ui/src/primitives/drawer/drawer.tsx:115) |
| `packages/ui/src/primitives/drawer/index.ts#DrawerTitleProps` (types) | type used in an exported signature (packages/ui/src/primitives/drawer/drawer.tsx:87) |
| `packages/ui/src/primitives/empty-state/index.ts#EmptyStateProps` (types) | type used in an exported signature (packages/ui/src/primitives/empty-state/empty-state.tsx:42) |
| `packages/ui/src/primitives/field/index.ts#FieldAlign` (types) | type used in an exported signature (packages/ui/src/primitives/field/field.tsx:46) |
| `packages/ui/src/primitives/field/index.ts#FieldOrientation` (types) | type used in an exported signature (packages/ui/src/primitives/field/field.tsx:44) |
| `packages/ui/src/primitives/field/index.ts#FieldProps` (types) | type used in an exported signature (packages/ui/src/primitives/field/field.tsx:114) |
| `packages/ui/src/primitives/fieldset/index.ts#FieldsetLegendProps` (types) | type used in an exported signature (packages/ui/src/primitives/fieldset/fieldset.tsx:26) |
| `packages/ui/src/primitives/fieldset/index.ts#FieldsetProps` (types) | type used in an exported signature (packages/ui/src/primitives/fieldset/fieldset.tsx:21) |
| `packages/ui/src/primitives/file-dropzone/index.ts#FileDropzoneProps` (types) | type used in an exported signature (packages/ui/src/primitives/file-dropzone/file-dropzone.tsx:207) |
| `packages/ui/src/primitives/file-dropzone/index.ts#FolderPickerProps` (types) | type used in an exported signature (packages/ui/src/primitives/file-dropzone/folder-picker.tsx:31) |
| `packages/ui/src/primitives/file-trigger/file-trigger.tsx#FileTriggerRenderProps` (types) | type used in an exported signature (packages/ui/src/primitives/file-trigger/file-trigger.tsx:16) |
| `packages/ui/src/primitives/file-trigger/index.ts#FileTriggerProps` (types) | type used in an exported signature (packages/ui/src/primitives/file-trigger/file-trigger.tsx:23) |
| `packages/ui/src/primitives/file-trigger/index.ts#FileTriggerRenderProps` (types) | type used in an exported signature (packages/ui/src/primitives/file-trigger/file-trigger.tsx:16) |
| `packages/ui/src/primitives/highlighted-text/highlighted-text.tsx#HighlightedTextRange` (types) | type used in an exported signature (packages/ui/src/primitives/highlighted-text/highlighted-text.tsx:17) |
| `packages/ui/src/primitives/highlighted-text/index.ts#HighlightedTextProps` (types) | type used in an exported signature (packages/ui/src/primitives/highlighted-text/highlighted-text.tsx:75) |
| `packages/ui/src/primitives/highlighted-text/index.ts#HighlightedTextRange` (types) | type used in an exported signature (packages/ui/src/primitives/highlighted-text/highlighted-text.tsx:17) |
| `packages/ui/src/primitives/hint-trigger/index.ts#HintTriggerProps` (types) | type used in an exported signature (packages/ui/src/primitives/hint-trigger/hint-trigger.tsx:55) |
| `packages/ui/src/primitives/icons/index.ts#IconProps` (types) | type used in an exported signature (packages/ui/src/primitives/icons/icon.tsx:85) |
| `packages/ui/src/primitives/input/index.ts#InputProps` (types) | type used in an exported signature (packages/ui/src/primitives/input/input.tsx:63); name read by tooling, scripts or root config (tooling/src/verify/gates/test-world-browser-contracts.ts:137) |
| `packages/ui/src/primitives/kbd/index.ts#KbdProps` (types) | type used in an exported signature (packages/ui/src/primitives/kbd/kbd.tsx:18) |
| `packages/ui/src/primitives/log-viewer/index.ts#LogLevel` (types) | derived union of an as const tuple; type used in an exported signature (packages/ui/src/primitives/log-viewer/log-viewer.tsx:31); name read by tooling, scripts or root config (tooling/src/floor/testing/stryker-config.ts:1) |
| `packages/ui/src/primitives/log-viewer/index.ts#LogViewerProps` (types) | type used in an exported signature (packages/ui/src/primitives/log-viewer/log-viewer.tsx:87) |
| `packages/ui/src/primitives/log-viewer/log-viewer.tsx#LogLevel` (types) | derived union of an as const tuple; type used in an exported signature (packages/ui/src/primitives/log-viewer/log-viewer.tsx:31); name read by tooling, scripts or root config (tooling/src/floor/testing/stryker-config.ts:1) |
| `packages/ui/src/primitives/macro-textarea/index.ts#MacroTextareaProps` (types) | type used in an exported signature (packages/ui/src/primitives/macro-textarea/macro-textarea.tsx:186) |
| `packages/ui/src/primitives/media-grid/index.ts#MediaGridProps` (types) | type used in an exported signature (packages/ui/src/primitives/media-grid/media-grid.tsx:195) |
| `packages/ui/src/primitives/media-grid/index.ts#MediaGridSelection` (types) | type used in an exported signature (packages/ui/src/primitives/media-grid/media-grid.tsx:93) |
| `packages/ui/src/primitives/media-grid/media-grid.tsx#MediaGridSelection` (types) | type used in an exported signature (packages/ui/src/primitives/media-grid/media-grid.tsx:93) |
| `packages/ui/src/primitives/media-tile-grid/index.ts#MediaTileAspect` (types) | derived union of an as const tuple; type used in an exported signature (packages/ui/src/primitives/media-tile-grid/media-tile-grid.tsx:121) |
| `packages/ui/src/primitives/media-tile-grid/index.ts#MediaTileGridProps` (types) | type used in an exported signature (packages/ui/src/primitives/media-tile-grid/media-tile-grid.tsx:146) |
| `packages/ui/src/primitives/media-tile-grid/index.ts#MediaTileGridSkeletonProps` (types) | type used in an exported signature (packages/ui/src/primitives/media-tile-grid/media-tile-grid.tsx:172) |
| `packages/ui/src/primitives/media-tile-grid/index.ts#MediaTileItem` (types) | type used in an exported signature (packages/ui/src/primitives/media-tile-grid/media-tile-grid.tsx:119) |
| `packages/ui/src/primitives/media-tile-grid/media-tile-grid.tsx#MediaTileItem` (types) | type used in an exported signature (packages/ui/src/primitives/media-tile-grid/media-tile-grid.tsx:119) |
| `packages/ui/src/primitives/menu/index.ts#MenuArrowProps` (types) | type used in an exported signature (packages/ui/src/primitives/menu/menu.tsx:96) |
| `packages/ui/src/primitives/menu/index.ts#MenuBackdropProps` (types) | type used in an exported signature (packages/ui/src/primitives/menu/menu.tsx:237) |
| `packages/ui/src/primitives/menu/index.ts#MenuCheckboxItemProps` (types) | type used in an exported signature (packages/ui/src/primitives/menu/menu.tsx:150) |
| `packages/ui/src/primitives/menu/index.ts#MenuGroupLabelProps` (types) | type used in an exported signature (packages/ui/src/primitives/menu/menu.tsx:136) |
| `packages/ui/src/primitives/menu/index.ts#MenuGroupProps` (types) | type used in an exported signature (packages/ui/src/primitives/menu/menu.tsx:126) |
| `packages/ui/src/primitives/menu/index.ts#MenuItemProps` (types) | type used in an exported signature (packages/ui/src/primitives/menu/menu.tsx:106) |
| `packages/ui/src/primitives/menu/index.ts#MenuLinkItemProps` (types) | type used in an exported signature (packages/ui/src/primitives/menu/menu.tsx:227) |
| `packages/ui/src/primitives/menu/index.ts#MenuPopupProps` (types) | type used in an exported signature (packages/ui/src/primitives/menu/menu.tsx:61) |
| `packages/ui/src/primitives/menu/index.ts#MenuRadioItemProps` (types) | type used in an exported signature (packages/ui/src/primitives/menu/menu.tsx:175) |
| `packages/ui/src/primitives/menu/index.ts#MenuSeparatorProps` (types) | type used in an exported signature (packages/ui/src/primitives/menu/menu.tsx:116) |
| `packages/ui/src/primitives/menu/index.ts#MenuSubmenuTriggerProps` (types) | type used in an exported signature (packages/ui/src/primitives/menu/menu.tsx:207) |
| `packages/ui/src/primitives/menu/index.ts#MenuViewportProps` (types) | type used in an exported signature (packages/ui/src/primitives/menu/menu.tsx:86) |
| `packages/ui/src/primitives/menu/menu.tsx#MenuArrowProps` (types) | type used in an exported signature (packages/ui/src/primitives/menu/menu.tsx:96) |
| `packages/ui/src/primitives/menu/menu.tsx#MenuBackdropProps` (types) | type used in an exported signature (packages/ui/src/primitives/menu/menu.tsx:237) |
| `packages/ui/src/primitives/menu/menu.tsx#MenuCheckboxItemProps` (types) | type used in an exported signature (packages/ui/src/primitives/menu/menu.tsx:150) |
| `packages/ui/src/primitives/menu/menu.tsx#MenuRadioItemProps` (types) | type used in an exported signature (packages/ui/src/primitives/menu/menu.tsx:175) |
| `packages/ui/src/primitives/menu/menu.tsx#MenuViewportProps` (types) | type used in an exported signature (packages/ui/src/primitives/menu/menu.tsx:86) |
| `packages/ui/src/primitives/message-list/index.ts#MessageListProps` (types) | type used in an exported signature (packages/ui/src/primitives/message-list/message-list.tsx:132) |
| `packages/ui/src/primitives/message-list/index.ts#MessageListRowNavigation` (types) | type used in an exported signature (packages/ui/src/primitives/message-list/message-list.tsx:99) |
| `packages/ui/src/primitives/number-field/index.ts#NumberFieldProps` (types) | type used in an exported signature (packages/ui/src/primitives/number-field/number-field.tsx:96) |
| `packages/ui/src/primitives/option-strip/index.ts#OptionStripProps` (types) | type used in an exported signature (packages/ui/src/primitives/option-strip/option-strip.tsx:52) |
| `packages/ui/src/primitives/picker-cell/index.ts#PickerCellProps` (types) | type used in an exported signature (packages/ui/src/primitives/radio-group/radio-group.tsx:111) |
| `packages/ui/src/primitives/popover/index.ts#PopoverArrowProps` (types) | type used in an exported signature (packages/ui/src/primitives/popover/popover.tsx:130) |
| `packages/ui/src/primitives/popover/index.ts#PopoverDescriptionProps` (types) | type used in an exported signature (packages/ui/src/primitives/popover/popover.tsx:152) |
| `packages/ui/src/primitives/popover/index.ts#PopoverPopupProps` (types) | type used in an exported signature (packages/ui/src/primitives/popover/popover.tsx:87) |
| `packages/ui/src/primitives/popover/index.ts#PopoverTitleProps` (types) | type used in an exported signature (packages/ui/src/primitives/popover/popover.tsx:143) |
| `packages/ui/src/primitives/popover/index.ts#PopoverViewportProps` (types) | type used in an exported signature (packages/ui/src/primitives/popover/popover.tsx:121) |
| `packages/ui/src/primitives/popover/popover.tsx#PopoverArrowProps` (types) | type used in an exported signature (packages/ui/src/primitives/popover/popover.tsx:130) |
| `packages/ui/src/primitives/popover/popover.tsx#PopoverDescriptionProps` (types) | type used in an exported signature (packages/ui/src/primitives/popover/popover.tsx:152) |
| `packages/ui/src/primitives/popover/popover.tsx#PopoverViewportProps` (types) | type used in an exported signature (packages/ui/src/primitives/popover/popover.tsx:121) |
| `packages/ui/src/primitives/progress/index.ts#ProgressProps` (types) | type used in an exported signature (packages/ui/src/primitives/progress/progress.tsx:23) |
| `packages/ui/src/primitives/radio-group/index.ts#RadioGroupItemProps` (types) | type used in an exported signature (packages/ui/src/primitives/radio-group/radio-group.tsx:66) |
| `packages/ui/src/primitives/radio-group/index.ts#RadioGroupPickerItemProps` (types) | type used in an exported signature (packages/ui/src/primitives/radio-group/radio-group.tsx:126) |
| `packages/ui/src/primitives/radio-group/index.ts#RadioGroupPickerProps` (types) | type used in an exported signature (packages/ui/src/primitives/radio-group/radio-group.tsx:97) |
| `packages/ui/src/primitives/radio-group/index.ts#RadioGroupProps` (types) | type used in an exported signature (packages/ui/src/primitives/radio-group/radio-group.tsx:35) |
| `packages/ui/src/primitives/reveal-gate/index.ts#RevealGateProps` (types) | type used in an exported signature (packages/ui/src/primitives/reveal-gate/reveal-gate.tsx:46) |
| `packages/ui/src/primitives/save-bar/index.ts#SaveBarProps` (types) | type used in an exported signature (packages/ui/src/primitives/save-bar/save-bar.tsx:25) |
| `packages/ui/src/primitives/scroll-area/index.ts#ScrollAreaProps` (types) | type used in an exported signature (packages/ui/src/primitives/scroll-area/scroll-area.tsx:41) |
| `packages/ui/src/primitives/scroll-area/index.ts#ScrollAreaViewportProps` (types) | type used in an exported signature (packages/ui/src/primitives/scroll-area/scroll-area.tsx:33) |
| `packages/ui/src/primitives/scroll-area/scroll-area.tsx#ScrollAreaViewportProps` (types) | type used in an exported signature (packages/ui/src/primitives/scroll-area/scroll-area.tsx:33) |
| `packages/ui/src/primitives/select/index.ts#SelectOptionGroup` (types) | type used in an exported signature (packages/ui/src/primitives/select/items.ts:37) |
| `packages/ui/src/primitives/select/index.ts#SelectProps` (types) | type used in an exported signature (packages/ui/src/primitives/select/select.tsx:183) |
| `packages/ui/src/primitives/selection-bar/index.ts#SelectionBarProps` (types) | type used in an exported signature (packages/ui/src/primitives/selection-bar/selection-bar.tsx:20) |
| `packages/ui/src/primitives/separator/index.ts#SeparatorProps` (types) | type used in an exported signature (packages/ui/src/primitives/separator/separator.tsx:16) |
| `packages/ui/src/primitives/series-row/index.ts#SeriesRowProps` (types) | type used in an exported signature (packages/ui/src/primitives/series-row/series-row.tsx:45) |
| `packages/ui/src/primitives/skeleton/index.ts#SkeletonProps` (types) | type used in an exported signature (packages/ui/src/primitives/skeleton/skeleton.tsx:10) |
| `packages/ui/src/primitives/slider/index.ts#SliderProps` (types) | type used in an exported signature (packages/ui/src/primitives/slider/slider.tsx:66) |
| `packages/ui/src/primitives/sortable/index.ts#SortableListProps` (types) | type used in an exported signature (packages/ui/src/primitives/sortable/sortable.tsx:252) |
| `packages/ui/src/primitives/spinner/index.ts#WebSpinnerProps` (types) | type used in an exported signature (packages/ui/src/primitives/spinner/spinner.tsx:44) |
| `packages/ui/src/primitives/status-chip/index.ts#StatusChipProps` (types) | type used in an exported signature (packages/ui/src/primitives/status-chip/status-chip.tsx:50) |
| `packages/ui/src/primitives/status-chip/index.ts#StatusChipStatus` (types) | derived union of an as const tuple; type used in an exported signature (packages/ui/src/primitives/status-chip/status-chip.tsx:38) |
| `packages/ui/src/primitives/status-chip/status-chip.tsx#StatusChipProps` (types) | type used in an exported signature (packages/ui/src/primitives/status-chip/status-chip.tsx:50) |
| `packages/ui/src/primitives/status-chip/status-chip.tsx#StatusChipStatus` (types) | derived union of an as const tuple; type used in an exported signature (packages/ui/src/primitives/status-chip/status-chip.tsx:38) |
| `packages/ui/src/primitives/switch/index.ts#SwitchProps` (types) | type used in an exported signature (packages/ui/src/primitives/switch/switch.tsx:17) |
| `packages/ui/src/primitives/table/index.ts#TablePagination` (types) | type used in an exported signature (packages/ui/src/primitives/table/table.tsx:65) |
| `packages/ui/src/primitives/table/index.ts#TableProps` (types) | type used in an exported signature (packages/ui/src/primitives/table/table.tsx:209) |
| `packages/ui/src/primitives/table/index.ts#TableSort` (types) | type used in an exported signature (packages/ui/src/primitives/table/table.tsx:58) |
| `packages/ui/src/primitives/table/table.tsx#TablePagination` (types) | type used in an exported signature (packages/ui/src/primitives/table/table.tsx:65) |
| `packages/ui/src/primitives/table/table.tsx#TableSort` (types) | type used in an exported signature (packages/ui/src/primitives/table/table.tsx:58) |
| `packages/ui/src/primitives/tabs/index.ts#TabsIndicatorProps` (types) | type used in an exported signature (packages/ui/src/primitives/tabs/tabs.tsx:140) |
| `packages/ui/src/primitives/tabs/index.ts#TabsListProps` (types) | type used in an exported signature (packages/ui/src/primitives/tabs/tabs.tsx:40) |
| `packages/ui/src/primitives/tabs/index.ts#TabsPanelProps` (types) | type used in an exported signature (packages/ui/src/primitives/tabs/tabs.tsx:190) |
| `packages/ui/src/primitives/tabs/index.ts#TabsProps` (types) | type used in an exported signature (packages/ui/src/primitives/tabs/tabs.tsx:35) |
| `packages/ui/src/primitives/tabs/index.ts#TabsTabProps` (types) | type used in an exported signature (packages/ui/src/primitives/tabs/tabs.tsx:46) |
| `packages/ui/src/primitives/text/index.ts#HeadingProps` (types) | type used in an exported signature (packages/ui/src/primitives/text/text.tsx:68) |
| `packages/ui/src/primitives/textarea/index.ts#TextareaProps` (types) | type used in an exported signature (packages/ui/src/primitives/textarea/textarea.tsx:35) |
| `packages/ui/src/primitives/toast/index.ts#ToasterProps` (types) | type used in an exported signature (packages/ui/src/primitives/toast/toast.tsx:131) |
| `packages/ui/src/primitives/toggle-group/index.ts#ToggleGroupProps` (types) | type used in an exported signature (packages/ui/src/primitives/toggle-group/toggle-group.tsx:29) |
| `packages/ui/src/primitives/toggle/index.ts#ToggleProps` (types) | type used in an exported signature (packages/ui/src/primitives/toggle/toggle.tsx:34) |
| `packages/ui/src/primitives/tool-call-block/index.ts#ToolCallBlockProps` (types) | type used in an exported signature (packages/ui/src/primitives/tool-call-block/tool-call-block.tsx:56) |
| `packages/ui/src/primitives/tool-call-block/index.ts#ToolCallBlockRecord` (types) | type used in an exported signature (packages/ui/src/primitives/tool-call-block/tool-call-block.tsx:21) |
| `packages/ui/src/primitives/tool-call-block/tool-call-block.tsx#ToolCallBlockRecord` (types) | type used in an exported signature (packages/ui/src/primitives/tool-call-block/tool-call-block.tsx:21) |
| `packages/ui/src/primitives/tooltip/index.ts#TooltipArrowProps` (types) | type used in an exported signature (packages/ui/src/primitives/tooltip/tooltip.tsx:238) |
| `packages/ui/src/primitives/tooltip/index.ts#TooltipPopupProps` (types) | type used in an exported signature (packages/ui/src/primitives/tooltip/tooltip.tsx:179) |
| `packages/ui/src/primitives/tooltip/index.ts#TooltipViewportProps` (types) | type used in an exported signature (packages/ui/src/primitives/tooltip/tooltip.tsx:222) |
| `packages/ui/src/primitives/tooltip/tooltip.tsx#TooltipArrowProps` (types) | type used in an exported signature (packages/ui/src/primitives/tooltip/tooltip.tsx:238) |
| `packages/ui/src/primitives/tooltip/tooltip.tsx#TooltipViewportProps` (types) | type used in an exported signature (packages/ui/src/primitives/tooltip/tooltip.tsx:222) |
| `packages/ui/src/primitives/virtual-list/index.ts#VirtualListProps` (types) | type used in an exported signature (packages/ui/src/primitives/virtual-list/virtual-list.tsx:114) |
| `packages/ui/src/stream/index.ts#StreamShimmerProps` (types) | type used in an exported signature (packages/ui/src/stream/shimmer.tsx:13) |
| `packages/ui/src/stream/index.ts#StreamStatus` (types) | derived union of an as const tuple; type used in an exported signature (packages/ui/src/stream/stream-text.tsx:19) |
| `packages/ui/src/stream/index.ts#StreamTextProps` (types) | type used in an exported signature (packages/ui/src/stream/stream-text.tsx:32) |
| `packages/ui/src/stream/index.ts#TypingDotsProps` (types) | type used in an exported signature (packages/ui/src/stream/typing-dots.tsx:17) |
| `packages/ui/src/stream/index.ts#UseSmoothTextOptions` (types) | type used in an exported signature (packages/ui/src/stream/use-smooth-text.ts:26) |
| `packages/ui/src/stream/stream-text.tsx#StreamStatus` (types) | derived union of an as const tuple; type used in an exported signature (packages/ui/src/stream/stream-text.tsx:19) |
| `packages/ui/src/stream/stream-text.tsx#StreamTextProps` (types) | type used in an exported signature (packages/ui/src/stream/stream-text.tsx:32) |

## Outside this leg: files of open lanes 1075 and 1078 (48)

| Row | Triage |
| - | - |
| `packages/ui/src/art/web-weave/index.ts#RADIUS_COUNT` (exports) | auto-candidate: barrel re-export reached only by legacy tests |
| `packages/ui/src/art/web-weave/index.ts#WEAVE_CHARACTERS` (exports) | auto-retain: as const tuple behind a derived union (packages/ui/src/art/web-weave/web-weave-character.ts:9) |
| `packages/ui/src/art/web-weave/index.ts#WEAVE_STATES` (exports) | auto-retain: as const tuple behind a derived union (packages/ui/src/art/web-weave/web-weave-geometry.ts:24) |
| `packages/ui/src/art/web-weave/index.ts#WEAVE_TIMELINE` (exports) | auto-candidate: barrel re-export reached only by legacy tests |
| `packages/ui/src/art/web-weave/index.ts#WEB_GLYPH_COMPACT` (exports) | auto-candidate: barrel re-export reached only by legacy tests |
| `packages/ui/src/art/web-weave/index.ts#buildStrandOut` (exports) | auto-candidate: barrel re-export reached only by legacy tests |
| `packages/ui/src/art/web-weave/index.ts#buildWeb` (exports) | auto-retain: name read by tooling, scripts or root config (packages/ui/src/art/web-weave/index.ts:1) |
| `packages/ui/src/art/web-weave/index.ts#weaveJitter` (exports) | auto-candidate: barrel re-export reached only by legacy tests |
| `packages/ui/src/art/web-weave/index.ts#weavePhaseAt` (exports) | auto-candidate: barrel re-export reached only by legacy tests |
| `packages/ui/src/art/web-weave/index.ts#webGlyph` (exports) | auto-retain: name read by tooling, scripts or root config (packages/ui/src/art/web-weave/index.ts:1) |
| `packages/ui/src/art/web-weave/index.ts#wrapToPi` (exports) | auto-candidate: barrel re-export reached only by legacy tests |
| `packages/ui/src/art/web-weave/web-glyph.ts#WEB_GLYPH_COMPACT` (exports) | judge: declaration anchored by legacy tests |
| `packages/ui/src/art/web-weave/web-weave-character.ts#WEAVE_CHARACTERS` (exports) | auto-retain: as const tuple behind a derived union (packages/ui/src/art/web-weave/web-weave-character.ts:9) |
| `packages/ui/src/art/web-weave/web-weave-geometry.ts#AUX_TURNS` (exports) | judge: bound constant (Spine-Testing §10) |
| `packages/ui/src/art/web-weave/web-weave-geometry.ts#CAPTURE_TURNS` (exports) | judge: bound constant (Spine-Testing §10) |
| `packages/ui/src/art/web-weave/web-weave-geometry.ts#RADIUS_COUNT` (exports) | judge: bound constant (Spine-Testing §10) |
| `packages/ui/src/art/web-weave/web-weave-geometry.ts#WEAVE_STATES` (exports) | auto-retain: as const tuple behind a derived union (packages/ui/src/art/web-weave/web-weave-geometry.ts:24) |
| `packages/ui/src/tokens/z-scope.ts#Z_STACKING_SCOPES` (exports) | auto-retain: as const tuple behind a derived union (packages/ui/src/tokens/z-scope.ts:59) |
| `packages/ui/src/tokens/z-scope.ts#Z_TOKEN_SCOPES` (exports) | auto-retain: imported by a rebuilt test or the testkit |
| `packages/ui/src/tokens/z-scope.ts#zScopeOfCssVar` (exports) | judge: declaration anchored by legacy tests |
| `packages/ui/token-contract.ts#FORMAT_SCHEMA_SHA256` (exports) | auto-retain: imported by a rebuilt test or the testkit |
| `packages/ui/token-contract.ts#RESOLVER_SCHEMA_SHA256` (exports) | auto-retain: imported by a rebuilt test or the testkit |
| `packages/ui/token-contract.ts#readTokenContractTexts` (exports) | auto-retain: imported by a rebuilt test or the testkit |
| `packages/ui/token-contract.ts#readTokenRemovalBaseline` (exports) | auto-retain: imported by a rebuilt test or the testkit |
| `packages/ui/token-contract.ts#validateTokenContract` (exports) | auto-candidate: declaration used only in its own module |
| `packages/ui/token-contract.ts#validateTokenContractTexts` (exports) | auto-retain: imported by a rebuilt test or the testkit |
| `packages/ui/tokens.build.ts#generateArtifacts` (exports) | auto-retain: imported by a rebuilt test or the testkit |
| `packages/ui/tokens.build.ts#renderGeneratedCss` (exports) | judge: declaration anchored by legacy tests |
| `packages/ui/src/art/web-weave/index.ts#BuildWebInput` (types) | auto-retain: type used in an exported signature (packages/ui/src/art/web-weave/web-weave-geometry.ts:209) |
| `packages/ui/src/art/web-weave/index.ts#SpiderLeg` (types) | auto-retain: type used in an exported signature (packages/ui/src/art/web-weave/web-weave-geometry.ts:77) |
| `packages/ui/src/art/web-weave/index.ts#WeaveCharacter` (types) | auto-retain: derived union of an as const tuple |
| `packages/ui/src/art/web-weave/index.ts#WeaveDewDrop` (types) | auto-retain: type used in an exported signature (packages/ui/src/art/web-weave/web-weave-geometry.ts:76) |
| `packages/ui/src/art/web-weave/index.ts#WeavePoint` (types) | auto-retain: type used in an exported signature (packages/ui/src/art/web-weave/web-weave-sway.ts:44) |
| `packages/ui/src/art/web-weave/index.ts#WeaveStrand` (types) | auto-retain: type used in an exported signature (packages/ui/src/art/web-weave/web-weave-sway.ts:22) |
| `packages/ui/src/art/web-weave/index.ts#WeaveVeilProps` (types) | auto-retain: type used in an exported signature (packages/ui/src/art/web-weave/weave-veil.tsx:39) |
| `packages/ui/src/art/web-weave/index.ts#WebGlyphGeometry` (types) | auto-retain: type used in an exported signature (packages/ui/src/art/web-weave/web-glyph.ts:53) |
| `packages/ui/src/art/web-weave/index.ts#WebGlyphInput` (types) | auto-retain: type used in an exported signature (packages/ui/src/art/web-weave/web-glyph.ts:53) |
| `packages/ui/src/art/web-weave/index.ts#WebGlyphSpoke` (types) | auto-retain: type used in an exported signature (packages/ui/src/art/web-weave/web-glyph.ts:23) |
| `packages/ui/src/art/web-weave/index.ts#WebWeaveProps` (types) | auto-retain: type used in an exported signature (packages/ui/src/art/web-weave/web-weave.tsx:165) |
| `packages/ui/src/art/web-weave/index.ts#WovenWeb` (types) | auto-retain: type used in an exported signature (packages/ui/src/art/web-weave/web-weave-touch.ts:27) |
| `packages/ui/src/art/web-weave/web-glyph.ts#WebGlyphSpoke` (types) | auto-retain: type used in an exported signature (packages/ui/src/art/web-weave/web-glyph.ts:23) |
| `packages/ui/src/art/web-weave/web-weave-geometry.ts#WeaveDewDrop` (types) | auto-retain: type used in an exported signature (packages/ui/src/art/web-weave/web-weave-geometry.ts:76) |
| `packages/ui/src/tokens/index.ts#SnappedTokenPath` (types) | judge: declaration anchored by legacy tests |
| `packages/ui/src/tokens/z-scope.ts#ZStackingScope` (types) | auto-retain: derived union of an as const tuple |
| `packages/ui/src/tokens/z-scope.ts#ZTokenPath` (types) | auto-retain: type used in an exported signature (packages/ui/src/tokens/z-scope.ts:70) |
| `packages/ui/token-contract.ts#TokenContractTexts` (types) | auto-retain: imported by a rebuilt test or the testkit |
| `packages/ui/token-contract.ts#TokenRemovalBaseline` (types) | auto-retain: type used in an exported signature (packages/ui/token-contract.ts:826) |
| `packages/ui/tokens.build.ts#GeneratedCssValue` (types) | auto-retain: type used in an exported signature (packages/ui/tokens.build.ts:322) |
