# 989 batch: `@orb/contracts`

## Outcome

All 649 baseline rows of `packages/contracts` are classified. 51 rows leave the baseline: 32 door edges removed, 17 declarations unexported, 2 types deleted. 53 judged rows and 545 rule-retained rows stay. Production Knip reports these 51 keys stale and no new finding. The UI batch is in `reports/review/989-batch-ui.md`; the baseline shrink is shared.

## Production roots and consumer scope

- Roots: production Knip (`pnpm knip:prod`, `includeEntryExports`) with every `@orb/contracts` subpath in `packages/contracts/package.json` as an entry. The consumers are `server`, `client`, `db`, `inference`, `showcase-plugins` and the contracts package itself.
- Not consumers: `tests/**`, `tests/support` and `tooling` (Knip ignores them in production mode). A test importer is evidence, never liveness.
- Excluded from action: none. The 1071, 1072 and 1075 lanes touch no contracts file.

## Method

- Rows and buckets: `node scripts/triage-production-exports.ts packages/contracts` on the base tree (`aeebf6cd5f`). It scanned 8830 TS, 1654 TSX and 181 JS tracked files.
- Callers: `codegraph callers` for every unexported declaration showed same-file references only, or none for `propertyPath`, `RpgStatResolution` and `RpgTrackerAppliesTo`, whose same-file uses `rg` confirms. `rg --word-regexp` over the tracked tree for every judged or candidate name, so string and registry lookups are covered.
- Door edges: `scripts/codemods/production-exports-989-workset.ts` turns the selected triage rows into the codemod workset. `scripts/codemods/production-exports-989.ts` validated every origin and removed the edges; no module request became empty.
- Legacy importers of a removed edge now import the origin through the root `#contracts/*` map; the legacy folder reaches raw without a grant. No case changed.
- Knip decided: a removed edge whose origin had no other production reader would have shown as a new finding; none did.

## Forks

- F1, test-anchored exports. The brief says to fix a test-only consumer to use the real door. Spine-Testing §10 says tests import limits, defaults and tokens from their production home, and the owner stopped legacy retrofits. My default: keep §10 values exported, and keep test-anchored functions and types until the rebuilt suite replaces the legacy case through a public caller. The alternative is to rewrite those legacy cases now.
- F2, `packages/contracts/src/memory/index.ts`: a pre-built memory surface with no importer; each export carries `@public`. My default: keep it until the owner rules whether the memory plan still needs it.

## Removed, unexported or deleted (51)

| Row | Class | Action | Evidence |
| - | - | - | - |
| `packages/contracts/src/assets/index.ts#ASSET_LIST_LIMIT_MIN` (exports) | used only in its own module | unexported | no importer; Knip reports the key stale |
| `packages/contracts/src/automation/index.ts#AUTOMATION_ACTION_ARMS_MIN` (exports) | used only in its own module | unexported | no importer; Knip reports the key stale |
| `packages/contracts/src/character/index.ts#PLUGIN_IMPORTED_FROM_PREFIX` (exports) | used only in its own module | unexported | no importer; Knip reports the key stale |
| `packages/contracts/src/chat/index.ts#FIXED_REGEX_TIER_KEYS` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | no importer; Knip reports the key stale |
| `packages/contracts/src/chat/index.ts#chatIdentitySchema` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | legacyTests 1 (tests/legacy/server/entry/boot/seed-read-back.suite.int.test.ts:11); Knip reports the key stale |
| `packages/contracts/src/chat/index.ts#handoffOfferContentsSchema` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | no importer; Knip reports the key stale |
| `packages/contracts/src/chat/index.ts#macroFreezeSchema` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | no importer; Knip reports the key stale |
| `packages/contracts/src/chat/index.ts#memberCardVisibilitySchema` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | legacyTests 1 (tests/legacy/contracts/chat/metadata.contract.test.ts:1); Knip reports the key stale |
| `packages/contracts/src/chat/index.ts#storedImportWindowSchema` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | no importer; Knip reports the key stale |
| `packages/contracts/src/chat/metadata.ts#GUIDED_STEER_INPUT_MAX` (exports) | used only in its own module | unexported | no importer; Knip reports the key stale |
| `packages/contracts/src/chat/regex-tiers.ts#FIXED_REGEX_TIER_KEYS` (exports) | used only in its own module | unexported | no importer; Knip reports the key stale |
| `packages/contracts/src/inference/capability/generation.ts#MODEL_ONLY_ROLE_HANDLING` (exports) | used only in its own module | unexported | no importer; Knip reports the key stale |
| `packages/contracts/src/inference/wire-subset.ts#propertyPath` (exports) | used only in its own module | unexported | no importer; Knip reports the key stale |
| `packages/contracts/src/plugin/index.ts#PLUGIN_TOOL_NAME_LOCAL_MAX` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | legacyTests 3 (tests/legacy/contracts/plugin/ui-footer-and-tool-card.contract.test.ts:3, tests/legacy/contracts/plugin/manifest.contract.test.ts:6); Knip reports the key stale |
| `packages/contracts/src/plugin/ui.ts#PLUGIN_COMMAND_ENUM_VALUES_MAX` (exports) | used only in its own module | unexported | no importer; Knip reports the key stale |
| `packages/contracts/src/plugin/ui.ts#PLUGIN_PAGE_STAGES_MAX` (exports) | used only in its own module | unexported | no importer; Knip reports the key stale |
| `packages/contracts/src/plugin/ui.ts#PLUGIN_SURFACE_TITLE_MAX` (exports) | used only in its own module | unexported | no importer; Knip reports the key stale |
| `packages/contracts/src/preset/index.ts#PRESET_COMPACTION_SLOT_ID` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | legacyTests 1 (tests/legacy/contracts/prose/index.contract.test.ts:13); Knip reports the key stale |
| `packages/contracts/src/preset/index.ts#PRESET_GUIDED_SLOT_IDS` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | legacyTests 1 (tests/legacy/contracts/prose/index.contract.test.ts:13); Knip reports the key stale |
| `packages/contracts/src/prose/index.ts#proseSlotIdSchema` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | no importer; Knip reports the key stale |
| `packages/contracts/src/prose/index.ts#resolveProseFrom` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | no importer; Knip reports the key stale |
| `packages/contracts/src/refinery/index.ts#SCORE_MIN` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | legacyTests 2 (tests/legacy/server/entry/compose/refinery.test.ts:16, tests/legacy/contracts/refinery/core.contract.test.ts:4); Knip reports the key stale |
| `packages/contracts/src/refinery/schema-authoring.ts#REFINERY_SCHEMA_NAME_PATTERN` (exports) | used only in its own module | unexported | no importer; Knip reports the key stale |
| `packages/contracts/src/refinery/schema-forge.ts#REFINERY_FORGE_MAX_FIELDS` (exports) | used only in its own module | unexported | no importer; Knip reports the key stale |
| `packages/contracts/src/refinery/schema-forge.ts#REFINERY_FORGE_MAX_PLAN_FIELDS` (exports) | used only in its own module | unexported | no importer; Knip reports the key stale |
| `packages/contracts/src/rpg/index.ts#actorTrackerWriteKeys` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | legacyTests 2 (tests/legacy/contracts/rpg/extraction-cache-stable.contract.test.ts:4, tests/legacy/server/domain/rpg/field-reachability.suite.int.test.ts:41); Knip reports the key stale |
| `packages/contracts/src/rpg/index.ts#rpgActorOpSchema` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | legacyTests 1 (tests/legacy/contracts/rpg/actor.contract.test.ts:8); Knip reports the key stale |
| `packages/contracts/src/rpg/index.ts#rpgCyoaChoiceBehaviorSchema` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | no importer; Knip reports the key stale |
| `packages/contracts/src/rpg/index.ts#rpgNpcRefSchema` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | no importer; Knip reports the key stale |
| `packages/contracts/src/rpg/index.ts#rpgQuestObjectiveSchema` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | no importer; Knip reports the key stale |
| `packages/contracts/src/rpg/index.ts#rpgQuestStatusSchema` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | legacyTests 1 (tests/legacy/contracts/rpg/enums.contract.test.ts:4); Knip reports the key stale |
| `packages/contracts/src/rpg/index.ts#rpgRelationshipKindSchema` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | no importer; Knip reports the key stale |
| `packages/contracts/src/rpg/index.ts#rpgRulesetSchema` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | legacyTests 1 (tests/legacy/contracts/rpg/ruleset.contract.test.ts:9); Knip reports the key stale |
| `packages/contracts/src/rpg/index.ts#rpgStatProfileSchema` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | legacyTests 2 (tests/legacy/contracts/rpg/profile.contract.test.ts:5, tests/legacy/contracts/rpg/profile.contract.test.ts:82); Knip reports the key stale |
| `packages/contracts/src/rpg/index.ts#rpgTrackerCarrierClassSchema` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | legacyTests 1 (tests/legacy/contracts/rpg/enums.contract.test.ts:4); Knip reports the key stale |
| `packages/contracts/src/rpg/index.ts#rpgTrackerShapeSchema` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | legacyTests 1 (tests/legacy/contracts/rpg/enums.contract.test.ts:4); Knip reports the key stale |
| `packages/contracts/src/rpg/index.ts#rpgTrackerSubjectSchema` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | legacyTests 1 (tests/legacy/contracts/rpg/enums.contract.test.ts:4); Knip reports the key stale |
| `packages/contracts/src/rpg/index.ts#rpgTrackerWriteSchema` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | legacyTests 1 (tests/legacy/contracts/rpg/enums.contract.test.ts:4); Knip reports the key stale |
| `packages/contracts/src/rpg/index.ts#rpgWeatherLabelSchema` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | no importer; Knip reports the key stale |
| `packages/contracts/src/rpg/index.ts#rpgWeatherTypeSchema` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | no importer; Knip reports the key stale |
| `packages/contracts/src/rpg/tools.ts#RPG_JOURNAL_TYPE_FALLBACK` (exports) | used only in its own module | unexported | no importer; Knip reports the key stale |
| `packages/contracts/src/search/index.ts#corpusSourceSchema` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | legacyTests 1 (tests/legacy/contracts/search/source.contract.test.ts:1); Knip reports the key stale |
| `packages/contracts/src/settings/index.ts#RATE_LIMIT_CAP_MAX` (exports) | used only in its own module | unexported | no importer; Knip reports the key stale |
| `packages/contracts/src/workloads/index.ts#indexSourceSchema` (exports) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | legacyTests 1 (tests/legacy/contracts/workloads/axes.contract.test.ts:2); Knip reports the key stale |
| `packages/contracts/src/import/index.ts#PersonaCollisionReview` (types) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | no importer; Knip reports the key stale |
| `packages/contracts/src/import/persona-collision.ts#PersonaCollisionReview` (types) | declared and used nowhere | deleted | no importer; Knip reports the key stale |
| `packages/contracts/src/rpg/index.ts#RpgStatResolution` (types) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | no importer; Knip reports the key stale |
| `packages/contracts/src/rpg/index.ts#RpgTrackerAppliesTo` (types) | door edge with no production consumer | removed the re-export (codemod); legacy importers moved to the raw origin path | no importer; Knip reports the key stale |
| `packages/contracts/src/rpg/profile.ts#RpgStatResolution` (types) | used only in its own module | unexported | no importer; Knip reports the key stale |
| `packages/contracts/src/rpg/snapshot.ts#RpgPlotAct` (types) | declared and used nowhere | deleted | no importer; Knip reports the key stale |
| `packages/contracts/src/rpg/tracker.ts#RpgTrackerAppliesTo` (types) | used only in its own module | unexported | no importer; Knip reports the key stale |

## Judged and kept (53)

| Row | Class | Action | Evidence |
| - | - | - | - |
| `packages/contracts/src/character/index.ts#CARD_VERSION_MAX` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 1 (tests/legacy/contracts/character/index.contract.test.ts:2) |
| `packages/contracts/src/character/index.ts#CREATOR_MAX` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 1 (tests/legacy/contracts/character/index.contract.test.ts:2) |
| `packages/contracts/src/character/index.ts#GREETINGS_MAX` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 2 (tests/legacy/contracts/refinery/index.contract.test.ts:9, tests/legacy/contracts/character/index.contract.test.ts:2) |
| `packages/contracts/src/character/index.ts#NICKNAME_MAX` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 1 (tests/legacy/contracts/character/index.contract.test.ts:2) |
| `packages/contracts/src/databank/index.ts#CHUNK_SIZE_DEFAULT` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 1 (tests/legacy/contracts/databank/index.contract.test.ts:2) |
| `packages/contracts/src/databank/index.ts#CHUNK_SIZE_MIN` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 1 (tests/legacy/contracts/databank/index.contract.test.ts:2) |
| `packages/contracts/src/databank/index.ts#MIN_SCORE_DEFAULT` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 1 (tests/legacy/contracts/databank/index.contract.test.ts:2) |
| `packages/contracts/src/databank/index.ts#OVERLAP_PERCENT_MAX` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 1 (tests/legacy/contracts/databank/index.contract.test.ts:2) |
| `packages/contracts/src/databank/index.ts#RETRIEVAL_K_DEFAULT` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 1 (tests/legacy/contracts/databank/index.contract.test.ts:2) |
| `packages/contracts/src/databank/index.ts#WHOLE_FILE_THRESHOLD_DEFAULT` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 1 (tests/legacy/contracts/databank/index.contract.test.ts:2) |
| `packages/contracts/src/extraction/index.ts#MIME_TO_FORMAT` (exports) | retain: Spine-Testing §10 value table read by a legacy test | keep | legacyTests 1 (tests/legacy/client/features/databank/lib/databank-model.test.ts:7) |
| `packages/contracts/src/identity/index.ts#HOST_NETWORK_OVERLAY` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 3 (tests/legacy/server/entry/http/host-allowlist.test.ts:5, tests/legacy/server/foundation/env/container.test.ts:3) |
| `packages/contracts/src/inference/capability/reads.ts#SETTABLE_WINDOW_FLOOR` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 1 (tests/legacy/contracts/inference/capability/reads.contract.test.ts:6) |
| `packages/contracts/src/inference/capability/reads.ts#roleHandlingFloorOf` (exports) | flag: legacy-test anchored function | keep until the rebuilt suite tests it through a public caller (fork F1) | legacyTests 1 (tests/legacy/contracts/inference/capability/reads.contract.test.ts:6) |
| `packages/contracts/src/inference/provider-id.ts#PROVIDER_ID` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 1 (tests/legacy/contracts/inference/providers.contract.test.ts:7) |
| `packages/contracts/src/plugin/frame.ts#PLUGIN_FRAME_RESULT_KEY` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 1 (tests/legacy/contracts/plugin/frame.contract.test.ts:21) |
| `packages/contracts/src/plugin/manifest.ts#PLUGIN_PROVIDERS_MAX` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 1 (tests/legacy/contracts/plugin/manifest.contract.test.ts:16) |
| `packages/contracts/src/plugin/manifest.ts#PLUGIN_SLUG_MAX` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 1 (tests/legacy/contracts/plugin/manifest.contract.test.ts:16) |
| `packages/contracts/src/plugin/manifest.ts#PLUGIN_TOOL_WIRE_NAME_MAX` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 2 (tests/legacy/server/domain/tool-use/verbs/register-plugin-tool.test.ts:20, tests/legacy/contracts/plugin/manifest.contract.test.ts:16) |
| `packages/contracts/src/plugin/ui.ts#PLUGIN_COMMAND_DESCRIBE_MAX` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 1 (tests/legacy/contracts/plugin/ui-browse-genre-and-commands.contract.test.ts:22) |
| `packages/contracts/src/plugin/ui.ts#PLUGIN_COMMAND_PLACEMENT_LABEL_MAX` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 2 (tests/legacy/contracts/plugin/ui-browse-genre-and-commands.contract.test.ts:22, tests/legacy/server/infra/plugin-host/membrane.test.ts:34) |
| `packages/contracts/src/plugin/ui.ts#PLUGIN_FOOTER_MAX_DEPTH` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 1 (tests/legacy/contracts/plugin/ui-footer-and-tool-card.contract.test.ts:14) |
| `packages/contracts/src/plugin/ui.ts#PLUGIN_FOOTER_MAX_NODES` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 1 (tests/legacy/contracts/plugin/ui-footer-and-tool-card.contract.test.ts:14) |
| `packages/contracts/src/plugin/ui.ts#PLUGIN_FRAME_CSS_MAX_CHARS` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 1 (tests/legacy/contracts/plugin/ui-surface-anchors-and-tiers.contract.test.ts:15) |
| `packages/contracts/src/plugin/ui.ts#PLUGIN_FRAME_HTML_MAX_CHARS` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 2 (tests/legacy/contracts/plugin/ui-surface-anchors-and-tiers.contract.test.ts:15, tests/legacy/server/infra/plugin-host/membrane.test.ts:34) |
| `packages/contracts/src/plugin/ui.ts#PLUGIN_GRID_TILES_MAX` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 2 (tests/legacy/contracts/plugin/ui-browse-genre-and-commands.contract.test.ts:22, tests/legacy/contracts/plugin/ui-bound-arms.contract.test.ts:12) |
| `packages/contracts/src/plugin/ui.ts#PLUGIN_ROWS_MAX` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 3 (tests/legacy/contracts/plugin/ui-node-vocabulary-and-caps.contract.test.ts:6, tests/legacy/contracts/plugin/ui-vocabulary-reach.contract.test.ts:12) |
| `packages/contracts/src/plugin/ui.ts#PLUGIN_SPEC_MAX_BYTES` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 1 (tests/legacy/contracts/plugin/ui-node-vocabulary-and-caps.contract.test.ts:6) |
| `packages/contracts/src/plugin/ui.ts#PLUGIN_SPEC_MAX_NODES` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 2 (tests/legacy/contracts/plugin/ui-node-vocabulary-and-caps.contract.test.ts:6, tests/legacy/contracts/plugin/ui-browse-genre-and-commands.contract.test.ts:22) |
| `packages/contracts/src/plugin/ui.ts#PLUGIN_TABS_OPTIONS_MAX` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 1 (tests/legacy/contracts/plugin/ui-vocabulary-reach.contract.test.ts:12) |
| `packages/contracts/src/plugin/ui.ts#PLUGIN_TEXT_MAX_BYTES` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 1 (tests/legacy/contracts/plugin/ui-node-vocabulary-and-caps.contract.test.ts:6) |
| `packages/contracts/src/plugin/ui.ts#PLUGIN_TILE_TAGS_MAX` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 1 (tests/legacy/contracts/plugin/ui-bound-arms.contract.test.ts:12) |
| `packages/contracts/src/preset/index.ts#CONFIG_LIFTS` (exports) | retain: Spine-Testing §10 default table read by a legacy test | keep | legacyTests 1 (tests/legacy/contracts/preset/prompt-config-defaults-and-lifts.contract.test.ts:4) |
| `packages/contracts/src/preset/prose.ts#PRESET_GUIDED_SLOT_IDS` (exports) | flag: no production reader; only a legacy test reads it | keep, owner decides deletion (fork F1) | legacyTests 1 (tests/legacy/contracts/prose/index.contract.test.ts:13) |
| `packages/contracts/src/prose-slot/index.ts#LEGACY_PROSE_BASE_VERSION` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 1 (tests/legacy/contracts/prose-slot/index.contract.test.ts:6) |
| `packages/contracts/src/refinery/index.ts#CRITIQUE_CHAR_BACKSTOP` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 1 (tests/legacy/contracts/refinery/index.contract.test.ts:11) |
| `packages/contracts/src/refinery/index.ts#CRITIQUE_TOKEN_MAX` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 1 (tests/legacy/contracts/refinery/index.contract.test.ts:11) |
| `packages/contracts/src/refinery/index.ts#ENTRIES_MAX` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 1 (tests/legacy/contracts/refinery/index.contract.test.ts:11) |
| `packages/contracts/src/refinery/index.ts#GREETING_INDEX_MAX` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 1 (tests/legacy/contracts/refinery/index.contract.test.ts:11) |
| `packages/contracts/src/refinery/index.ts#HOST_PROSE_MAX_CHARS` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 1 (tests/legacy/contracts/refinery/index.contract.test.ts:11) |
| `packages/contracts/src/refinery/index.ts#NOTE_MAX` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 1 (tests/legacy/contracts/refinery/index.contract.test.ts:11) |
| `packages/contracts/src/refinery/index.ts#REWRITE_TEXT_MAX` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 1 (tests/legacy/contracts/refinery/index.contract.test.ts:11) |
| `packages/contracts/src/refinery/index.ts#SESSION_NAME_MAX` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 1 (tests/legacy/contracts/refinery/index.contract.test.ts:11) |
| `packages/contracts/src/refinery/schema-forge.ts#REFINERY_FORGE_MAX_PATH_SEGMENTS` (exports) | retain: Spine-Testing §10 limit read by a legacy test | keep | legacyTests 1 (tests/legacy/contracts/refinery/schema-forge.contract.test.ts:13) |
| `packages/contracts/src/rpg/ambient.ts#timeOfDayAtHour` (exports) | flag: legacy-test anchored function | keep until the rebuilt suite tests it through a public caller (fork F1) | legacyTests 2 (tests/legacy/contracts/rpg/ambient.contract.test.ts:16, tests/legacy/ui/charts/meter/waystone-treatment.dom.test.ts:31) |
| `packages/contracts/src/rpg/inputs.ts#RPG_JOURNAL_LIST_MAX_LIMIT` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 1 (tests/legacy/contracts/rpg/inputs.contract.test.ts:25) |
| `packages/contracts/src/rpg/inputs.ts#RPG_TURN_TOOL_CALLS_LIST_MAX_LIMIT` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 1 (tests/legacy/contracts/rpg/inputs.contract.test.ts:25) |
| `packages/contracts/src/rpg/profile.ts#RPG_SEED_HP_MAX` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 3 (tests/legacy/contracts/rpg/profile.contract.test.ts:15, tests/legacy/server/domain/rpg/tools/apply.test.ts:17) |
| `packages/contracts/src/rpg/snapshot.ts#RPG_SNAPSHOT_STATE_PLANES` (exports) | retain: Spine-Testing §10 vocabulary tuple read by a legacy test | keep | legacyTests 1 (tests/legacy/contracts/rpg/snapshot.contract.test.ts:21) |
| `packages/contracts/src/rpg/structured-patch.ts#RPG_PATCH_INDEX_MAX` (exports) | retain: Spine-Testing §10 bound constant read by a test | keep | legacyTests 1 (tests/legacy/contracts/rpg/structured-patch.contract.test.ts:27) |
| `packages/contracts/src/settings/appearance.ts#DEFAULT_BLUR_SURFACES` (exports) | retain: Spine-Testing §10 default read by legacy tests | keep | legacyTests 2 (tests/legacy/contracts/settings/appearance.contract.test.ts:11, tests/legacy/contracts/settings/index.contract.test.ts:25) |
| `packages/contracts/src/memory/index.ts#(file)` (files) | flag: pre-built surface; every export carries @public | keep, owner decides (fork F2) | no importer |
| `packages/contracts/src/embeddings/index.ts#ImageBreakdown` (types) | flag: legacy-test anchored type | keep until the rebuilt suite derives it (fork F1) | legacyTests 2 (tests/legacy/server/domain/embeddings/_support.ts:17, tests/legacy/server/domain/embeddings/indexer/caption.test.ts:6) |

## Kept by a merged triage retention rule (545)

| Row | Rule |
| - | - |
| `packages/contracts/src/assets/index.ts#VARIANT_KINDS` (exports) | as const tuple behind a derived union (packages/contracts/src/assets/index.ts:36) |
| `packages/contracts/src/automation/index.ts#AUTOMATION_ARM_SCOPES` (exports) | as const tuple behind a derived union (packages/contracts/src/automation/index.ts:275) |
| `packages/contracts/src/automation/index.ts#AUTOMATION_RULE_REFUSAL_CODES` (exports) | as const tuple behind a derived union (packages/contracts/src/automation/index.ts:1093) |
| `packages/contracts/src/automation/index.ts#AUTOMATION_RUN_OUTCOMES` (exports) | as const tuple behind a derived union (packages/contracts/src/automation/index.ts:867) |
| `packages/contracts/src/automation/index.ts#AUTOMATION_SUGGESTION_KINDS` (exports) | as const tuple behind a derived union (packages/contracts/src/automation/index.ts:842) |
| `packages/contracts/src/automation/index.ts#RULE_PRESET_ENTITY_KINDS` (exports) | as const tuple behind a derived union (packages/contracts/src/automation/presets.ts:121) |
| `packages/contracts/src/automation/index.ts#RULE_PRESET_KNOB_KINDS` (exports) | as const tuple behind a derived union (packages/contracts/src/automation/presets.ts:113) |
| `packages/contracts/src/automation/index.ts#RULE_PRESET_SCOPES` (exports) | as const tuple behind a derived union (packages/contracts/src/automation/presets.ts:108) |
| `packages/contracts/src/automation/index.ts#automationTriggerSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/automation/index.ts#triggerFactSchema` (exports) | imported by a rebuilt test or the testkit; name read by tooling, scripts or root config (tooling/src/verify/gates/no-raw-id.ts:27); module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/automation/presets.ts#RULE_PRESET_ENTITY_KINDS` (exports) | as const tuple behind a derived union (packages/contracts/src/automation/presets.ts:121) |
| `packages/contracts/src/automation/presets.ts#RULE_PRESET_KNOB_KINDS` (exports) | as const tuple behind a derived union (packages/contracts/src/automation/presets.ts:113) |
| `packages/contracts/src/automation/presets.ts#RULE_PRESET_SCOPES` (exports) | as const tuple behind a derived union (packages/contracts/src/automation/presets.ts:108) |
| `packages/contracts/src/automation/presets.ts#rulePresetKnobValueSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/automation/presets.ts#rulePresetKnobViewSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/automation/presets.ts#rulePresetScopeSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/character/index.ts#CARD_SPECS` (exports) | as const tuple behind a derived union (packages/contracts/src/character/index.ts:39) |
| `packages/contracts/src/character/index.ts#CHARACTER_BULK_TAG_FAILURE_CODES` (exports) | as const tuple behind a derived union (packages/contracts/src/character/index.ts:662) |
| `packages/contracts/src/character/index.ts#CHARACTER_PROVENANCES` (exports) | as const tuple behind a derived union (packages/contracts/src/character/index.ts:71) |
| `packages/contracts/src/character/index.ts#TEXT_MAX` (exports) | named in law (docs/adr/0137-a-chat-s-referenced-identities-are-served-by.md) |
| `packages/contracts/src/character/index.ts#cardSpecSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/character/index.ts#characterBulkTagFailureSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/character/index.ts#characterCardSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/character/index.ts#characterSummarySchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/character/index.ts#characterTagGroupCensusSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/character/index.ts#greetingSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/chat/assemble.ts#CHAT_INJECTION_ORIGINS` (exports) | as const tuple behind a derived union (packages/contracts/src/chat/assemble.ts:135) |
| `packages/contracts/src/chat/assemble.ts#CONTEXT_LIMIT_KINDS` (exports) | as const tuple behind a derived union (packages/contracts/src/chat/assemble.ts:296) |
| `packages/contracts/src/chat/assemble.ts#MEMORY_RECALL_VERDICTS` (exports) | as const tuple behind a derived union (packages/contracts/src/chat/assemble.ts:171) |
| `packages/contracts/src/chat/assemble.ts#SHAPE_BREAKPOINT_DECISIONS` (exports) | imported by a rebuilt test or the testkit; as const tuple behind a derived union (packages/contracts/src/chat/assemble.ts:396) |
| `packages/contracts/src/chat/assemble.ts#SHAPE_FOLD_REASONS` (exports) | as const tuple behind a derived union (packages/contracts/src/chat/assemble.ts:424) |
| `packages/contracts/src/chat/assemble.ts#SHAPE_ROW_SOURCES` (exports) | as const tuple behind a derived union (packages/contracts/src/chat/assemble.ts:412) |
| `packages/contracts/src/chat/bulk-import.ts#pendingGenerationObservationInputSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/chat/bus.ts#CHAT_WARNING_CODES` (exports) | imported by a rebuilt test or the testkit; as const tuple behind a derived union (packages/contracts/src/chat/bus.ts:189); name read by tooling, scripts or root config (tooling/src/verify/gates/warning-code-coverage.ts:6); named in law (docs/adr/0048-tool-calling-and-structured-output-ride-capabilities.md) |
| `packages/contracts/src/chat/bus.ts#MEMORY_RECALL_PHASES` (exports) | as const tuple behind a derived union (packages/contracts/src/chat/bus.ts:284) |
| `packages/contracts/src/chat/bus.ts#PLAIN_CHAT_WARNING_CODES` (exports) | as const tuple behind a derived union (packages/contracts/src/chat/bus.ts:174) |
| `packages/contracts/src/chat/bus.ts#PROVIDER_ADJUSTMENT_KINDS` (exports) | imported by a rebuilt test or the testkit; as const tuple behind a derived union (packages/contracts/src/chat/bus.ts:240) |
| `packages/contracts/src/chat/bus.ts#TURN_INTENTS` (exports) | as const tuple behind a derived union (packages/contracts/src/chat/bus.ts:271) |
| `packages/contracts/src/chat/content-blocks.ts#cardTrustSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/chat/content-classes.ts#CONTENT_CLASS_POLICY` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/message-kind-policy-coverage.ts:28); dispatch table |
| `packages/contracts/src/chat/detail.ts#ANCHOR_STATES` (exports) | as const tuple behind a derived union (packages/contracts/src/chat/detail.ts:23) |
| `packages/contracts/src/chat/index.ts#AI_DRIVEN_KINDS` (exports) | named in law (docs/adr/0060-agents-first-class-principals.md) |
| `packages/contracts/src/chat/index.ts#ANCHOR_STATES` (exports) | as const tuple behind a derived union (packages/contracts/src/chat/detail.ts:23) |
| `packages/contracts/src/chat/index.ts#CHAT_IDENTITY_KINDS` (exports) | as const tuple behind a derived union (packages/contracts/src/chat/producers.ts:25); named in law (docs/adr/0137-a-chat-s-referenced-identities-are-served-by.md) |
| `packages/contracts/src/chat/index.ts#CHAT_INJECTION_ORIGINS` (exports) | as const tuple behind a derived union (packages/contracts/src/chat/assemble.ts:135) |
| `packages/contracts/src/chat/index.ts#CHAT_WARNING_CODES` (exports) | imported by a rebuilt test or the testkit; as const tuple behind a derived union (packages/contracts/src/chat/bus.ts:189); name read by tooling, scripts or root config (tooling/src/verify/gates/warning-code-coverage.ts:6); named in law (docs/adr/0048-tool-calling-and-structured-output-ride-capabilities.md) |
| `packages/contracts/src/chat/index.ts#CONTENT_CLASS_POLICY` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/message-kind-policy-coverage.ts:28); dispatch table |
| `packages/contracts/src/chat/index.ts#CONTEXT_LIMIT_KINDS` (exports) | as const tuple behind a derived union (packages/contracts/src/chat/assemble.ts:296) |
| `packages/contracts/src/chat/index.ts#MEMORY_RECALL_PHASES` (exports) | as const tuple behind a derived union (packages/contracts/src/chat/bus.ts:284) |
| `packages/contracts/src/chat/index.ts#MEMORY_RECALL_VERDICTS` (exports) | as const tuple behind a derived union (packages/contracts/src/chat/assemble.ts:171) |
| `packages/contracts/src/chat/index.ts#PLAIN_CHAT_WARNING_CODES` (exports) | as const tuple behind a derived union (packages/contracts/src/chat/bus.ts:174) |
| `packages/contracts/src/chat/index.ts#PROVIDER_ADJUSTMENT_KINDS` (exports) | imported by a rebuilt test or the testkit; as const tuple behind a derived union (packages/contracts/src/chat/bus.ts:240) |
| `packages/contracts/src/chat/index.ts#SHAPE_BREAKPOINT_DECISIONS` (exports) | imported by a rebuilt test or the testkit; as const tuple behind a derived union (packages/contracts/src/chat/assemble.ts:396) |
| `packages/contracts/src/chat/index.ts#SHAPE_FOLD_REASONS` (exports) | as const tuple behind a derived union (packages/contracts/src/chat/assemble.ts:424) |
| `packages/contracts/src/chat/index.ts#SHAPE_ROW_SOURCES` (exports) | as const tuple behind a derived union (packages/contracts/src/chat/assemble.ts:412) |
| `packages/contracts/src/chat/index.ts#SMART_PICKERS` (exports) | as const tuple behind a derived union (packages/contracts/src/chat/metadata.ts:96) |
| `packages/contracts/src/chat/index.ts#TURN_ABORT_REASONS` (exports) | as const tuple behind a derived union (packages/contracts/src/chat/bus.ts:275) |
| `packages/contracts/src/chat/index.ts#TURN_INTENTS` (exports) | as const tuple behind a derived union (packages/contracts/src/chat/bus.ts:271) |
| `packages/contracts/src/chat/index.ts#USER_BACKED_KINDS` (exports) | named in law (docs/adr/0060-agents-first-class-principals.md) |
| `packages/contracts/src/chat/index.ts#inviteStatusSchema` (exports) | @public TSDoc |
| `packages/contracts/src/chat/index.ts#rosterMemberSpecSchema` (exports) | name read by tooling, scripts or root config (scripts/codemods/rename-roster-participants.ts:19); named in law (docs/law/Spine-Identity-and-Auth.md) |
| `packages/contracts/src/chat/index.ts#stripHiddenForMember` (exports) | @public TSDoc |
| `packages/contracts/src/chat/index.ts#stripReasoningFromView` (exports) | @public TSDoc |
| `packages/contracts/src/chat/messages.ts#connectionAttributionProvenanceSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/chat/messages.ts#standaloneVariableDeltaSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/chat/messages.ts#variablePreconditionSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/chat/messages.ts#variantMetadataSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/chat/metadata.ts#SMART_PICKERS` (exports) | as const tuple behind a derived union (packages/contracts/src/chat/metadata.ts:96) |
| `packages/contracts/src/chat/metadata.ts#groupPolicySchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/chat/participants.ts#AI_DRIVEN_KINDS` (exports) | named in law (docs/adr/0060-agents-first-class-principals.md) |
| `packages/contracts/src/chat/participants.ts#USER_BACKED_KINDS` (exports) | named in law (docs/adr/0060-agents-first-class-principals.md) |
| `packages/contracts/src/chat/producers.ts#CHAT_IDENTITY_KINDS` (exports) | as const tuple behind a derived union (packages/contracts/src/chat/producers.ts:25); named in law (docs/adr/0137-a-chat-s-referenced-identities-are-served-by.md) |
| `packages/contracts/src/chat/reactions.ts#messageReactionGroupSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/chat/roster.ts#renderPolicySchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/chat/roster.ts#rosterMemberSpecSchema` (exports) | name read by tooling, scripts or root config (scripts/codemods/rename-roster-participants.ts:19); module-level contract schema (contract-structural-copy reads it); named in law (docs/law/Spine-Identity-and-Auth.md) |
| `packages/contracts/src/chat/views.ts#chatSeatPortraitSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/credentials/index.ts#RESOLVED_SECRET_KINDS` (exports) | as const tuple behind a derived union (packages/contracts/src/credentials/index.ts:102) |
| `packages/contracts/src/databank/index.ts#INGEST_OUTCOMES` (exports) | as const tuple behind a derived union (packages/contracts/src/databank/index.ts:291) |
| `packages/contracts/src/databank/index.ts#databankSettingsSchema` (exports) | imported by a rebuilt test or the testkit; module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/databank/index.ts#documentCharacterRefSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/databank/index.ts#scraperKindSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/debug/index.ts#chatInspectionSchema` (exports) | imported by a rebuilt test or the testkit; module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/debug/index.ts#debugErrorsResponseSchema` (exports) | imported by a rebuilt test or the testkit; module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/debug/index.ts#rpgTracesResponseSchema` (exports) | imported by a rebuilt test or the testkit; module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/debug/index.ts#wireCaptureSchema` (exports) | imported by a rebuilt test or the testkit; module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/debug/index.ts#wireCapturesResponseSchema` (exports) | imported by a rebuilt test or the testkit; module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/discovery/index.ts#ANALYTICS_EMPTY_REASONS` (exports) | as const tuple behind a derived union (packages/contracts/src/discovery/index.ts:125) |
| `packages/contracts/src/discovery/index.ts#BROWSE_SORTS` (exports) | as const tuple behind a derived union (packages/contracts/src/discovery/index.ts:55) |
| `packages/contracts/src/discovery/index.ts#browseCharacterSchema` (exports) | imported by a rebuilt test or the testkit; module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/discovery/index.ts#comparedCharacterSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/discovery/index.ts#comparisonNarrativeSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/discovery/index.ts#dossierNeighborSchema` (exports) | imported by a rebuilt test or the testkit; module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/discovery/index.ts#facetCountSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/discovery/index.ts#portraitAlignmentSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/discovery/index.ts#similarityGraphEdgeSchema` (exports) | imported by a rebuilt test or the testkit; module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/discovery/index.ts#similarityGraphNodeSchema` (exports) | imported by a rebuilt test or the testkit; module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/discovery/index.ts#tagCountSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/discovery/index.ts#tagPairSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/discovery/index.ts#themeDriftThemeSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/discovery/index.ts#themeMemberSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/discovery/index.ts#themeRowSchema` (exports) | imported by a rebuilt test or the testkit |
| `packages/contracts/src/discovery/index.ts#themeTimelineBucketSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/embeddings/index.ts#IMAGE_ART_STYLES` (exports) | as const tuple behind a derived union (packages/contracts/src/embeddings/index.ts:192) |
| `packages/contracts/src/embeddings/index.ts#IMAGE_BODY_TYPES` (exports) | as const tuple behind a derived union (packages/contracts/src/embeddings/index.ts:200) |
| `packages/contracts/src/embeddings/index.ts#IMAGE_CAMERA_ANGLES` (exports) | as const tuple behind a derived union (packages/contracts/src/embeddings/index.ts:197) |
| `packages/contracts/src/embeddings/index.ts#IMAGE_CHEST_SIZES` (exports) | as const tuple behind a derived union (packages/contracts/src/embeddings/index.ts:201) |
| `packages/contracts/src/embeddings/index.ts#IMAGE_CLOTHING_STATES` (exports) | as const tuple behind a derived union (packages/contracts/src/embeddings/index.ts:204) |
| `packages/contracts/src/embeddings/index.ts#IMAGE_COVERAGES` (exports) | as const tuple behind a derived union (packages/contracts/src/embeddings/index.ts:199) |
| `packages/contracts/src/embeddings/index.ts#IMAGE_EXPOSED_PARTS` (exports) | as const tuple behind a derived union (packages/contracts/src/embeddings/index.ts:206) |
| `packages/contracts/src/embeddings/index.ts#IMAGE_FACET_NATURES` (exports) | as const tuple behind a derived union (packages/contracts/src/embeddings/index.ts:87) |
| `packages/contracts/src/embeddings/index.ts#IMAGE_GENDERS` (exports) | as const tuple behind a derived union (packages/contracts/src/embeddings/index.ts:198) |
| `packages/contracts/src/embeddings/index.ts#IMAGE_MOODS` (exports) | as const tuple behind a derived union (packages/contracts/src/embeddings/index.ts:194) |
| `packages/contracts/src/embeddings/index.ts#IMAGE_NUDITY_LEVELS` (exports) | as const tuple behind a derived union (packages/contracts/src/embeddings/index.ts:205) |
| `packages/contracts/src/embeddings/index.ts#IMAGE_OUTFIT_TYPES` (exports) | as const tuple behind a derived union (packages/contracts/src/embeddings/index.ts:203) |
| `packages/contracts/src/embeddings/index.ts#IMAGE_PALETTES` (exports) | as const tuple behind a derived union (packages/contracts/src/embeddings/index.ts:193) |
| `packages/contracts/src/embeddings/index.ts#IMAGE_RATINGS` (exports) | as const tuple behind a derived union (packages/contracts/src/embeddings/index.ts:195) |
| `packages/contracts/src/embeddings/index.ts#IMAGE_SHOT_TYPES` (exports) | as const tuple behind a derived union (packages/contracts/src/embeddings/index.ts:196) |
| `packages/contracts/src/embeddings/index.ts#IMAGE_SKIN_TONES` (exports) | as const tuple behind a derived union (packages/contracts/src/embeddings/index.ts:202) |
| `packages/contracts/src/events/index.ts#DOMAIN_EVENT_TYPES` (exports) | as const tuple behind a derived union (packages/contracts/src/events/index.ts:37); name read by tooling, scripts or root config (tooling/src/verify/gates/bus-consumer-belt.ts:129) |
| `packages/contracts/src/extraction/index.ts#DOC_FORMATS` (exports) | as const tuple behind a derived union (packages/contracts/src/extraction/index.ts:17) |
| `packages/contracts/src/identity/index.ts#AUTH_MODE_SOURCES` (exports) | as const tuple behind a derived union (packages/contracts/src/identity/index.ts:64) |
| `packages/contracts/src/identity/index.ts#CHAT_ACTIONS` (exports) | as const tuple behind a derived union (packages/contracts/src/identity/index.ts:357) |
| `packages/contracts/src/identity/index.ts#COOKIE_AUTH_MODES` (exports) | as const tuple behind a derived union (packages/contracts/src/identity/index.ts:124) |
| `packages/contracts/src/identity/index.ts#GLOBAL_ACTIONS` (exports) | as const tuple behind a derived union (packages/contracts/src/identity/index.ts:353) |
| `packages/contracts/src/identity/index.ts#INSTALL_KINDS` (exports) | as const tuple behind a derived union (packages/contracts/src/identity/index.ts:68) |
| `packages/contracts/src/identity/index.ts#IP_CERTIFICATE_FAILURES` (exports) | as const tuple behind a derived union (packages/contracts/src/identity/index.ts:231) |
| `packages/contracts/src/identity/index.ts#IP_CERTIFICATE_STATES` (exports) | as const tuple behind a derived union (packages/contracts/src/identity/index.ts:226) |
| `packages/contracts/src/identity/index.ts#RELAY_DOWN_REASONS` (exports) | as const tuple behind a derived union (packages/contracts/src/identity/index.ts:165) |
| `packages/contracts/src/identity/index.ts#SHARE_RELAY_KINDS` (exports) | as const tuple behind a derived union (packages/contracts/src/identity/index.ts:155) |
| `packages/contracts/src/identity/index.ts#SHARE_STATES` (exports) | as const tuple behind a derived union (packages/contracts/src/identity/index.ts:161) |
| `packages/contracts/src/identity/index.ts#ipCertificateStatusSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/identity/index.ts#relayStatusSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/imagery/index.ts#generatedPictureImageSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/imagery/index.ts#imageryWarningSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/imagery/portable.ts#portableImageryImageSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/import/index.ts#PERSONA_COLLISION_CHOICES` (exports) | as const tuple behind a derived union (packages/contracts/src/import/persona-collision.ts:8) |
| `packages/contracts/src/import/index.ts#PERSONA_DIFFERENCES` (exports) | as const tuple behind a derived union (packages/contracts/src/import/persona-collision.ts:61) |
| `packages/contracts/src/import/index.ts#ST_PROFILE_HANDLED_ENTRIES` (exports) | as const tuple behind a derived union (packages/contracts/src/import/index.ts:48) |
| `packages/contracts/src/import/persona-collision.ts#PERSONA_COLLISION_CHOICES` (exports) | as const tuple behind a derived union (packages/contracts/src/import/persona-collision.ts:8) |
| `packages/contracts/src/import/persona-collision.ts#PERSONA_DIFFERENCES` (exports) | as const tuple behind a derived union (packages/contracts/src/import/persona-collision.ts:61) |
| `packages/contracts/src/inference/cache-policy.ts#CACHE_POLICY_PROVENANCES` (exports) | as const tuple behind a derived union (packages/contracts/src/inference/cache-policy.ts:50) |
| `packages/contracts/src/inference/cache-policy.ts#PREFIX_CACHE_ACTIONS` (exports) | as const tuple behind a derived union (packages/contracts/src/inference/cache-policy.ts:31) |
| `packages/contracts/src/inference/cache-policy.ts#resolvedCacheConnectionViewSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/inference/capability/capability.ts#KIND_DEFS` (exports) | imported by a rebuilt test or the testkit; name read by tooling, scripts or root config (packages/contracts/src/inference/capability/index.ts:1) |
| `packages/contracts/src/inference/capability/embedding.ts#localTextEncodingSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/inference/capability/generation.ts#REASONING_DISPLAY_MODES` (exports) | as const tuple behind a derived union (packages/contracts/src/inference/capability/generation.ts:57) |
| `packages/contracts/src/inference/capability/generation.ts#REASONING_OFF_MODES` (exports) | as const tuple behind a derived union (packages/contracts/src/inference/capability/generation.ts:50) |
| `packages/contracts/src/inference/capability/generation.ts#REASONING_REPLAY_MODES` (exports) | as const tuple behind a derived union (packages/contracts/src/inference/capability/generation.ts:42) |
| `packages/contracts/src/inference/capability/generation.ts#SAMPLER_STAGES` (exports) | as const tuple behind a derived union (packages/contracts/src/inference/capability/generation.ts:181); named in law (docs/adr/0295-sampler-order-on-the-chat-wire.md) |
| `packages/contracts/src/inference/capability/generation.ts#SYSTEM_ROW_PLACEMENTS` (exports) | as const tuple behind a derived union (packages/contracts/src/inference/capability/generation.ts:89) |
| `packages/contracts/src/inference/capability/generation.ts#rangeSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/inference/capability/generation.ts#reasoningCapabilitySchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/inference/capability/generation.ts#reasoningDisplayModeSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/inference/capability/generation.ts#reasoningModeSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/inference/capability/generation.ts#reasoningOffModeSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/inference/capability/generation.ts#reasoningReplayModeSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/inference/capability/generation.ts#roleHandlingSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/inference/capability/generation.ts#samplerStageSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/inference/capability/generation.ts#samplingCapabilitySchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/inference/capability/generation.ts#turnsCapabilitySchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/inference/capability/generation.ts#verbositySchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/inference/capability/reads.ts#accepts` (exports) | name read by tooling, scripts or root config (.dependency-cruiser.cjs:7) |
| `packages/contracts/src/inference/capability/rerank.ts#RERANK_ONNX_HEADS` (exports) | as const tuple behind a derived union (packages/contracts/src/inference/capability/rerank.ts:25) |
| `packages/contracts/src/inference/capability/rerank.ts#rerankOnnxSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/inference/deltas.ts#DELTA_KINDS` (exports) | as const tuple behind a derived union (packages/contracts/src/inference/deltas.ts:6) |
| `packages/contracts/src/inference/evidence.ts#EVIDENCE_TIERS` (exports) | as const tuple behind a derived union (packages/contracts/src/inference/evidence.ts:17); named in law (docs/law/Tier-3b-Providers.md) |
| `packages/contracts/src/inference/features.ts#BELT_OWNED_BODY_KEYS` (exports) | as const tuple behind a derived union (packages/contracts/src/inference/features.ts:269); named in law (docs/adr/0143-the-vllm-source-errs-open-capability-is-per.md) |
| `packages/contracts/src/inference/features.ts#WIRE_DEFAULT_FEATURES` (exports) | imported by a rebuilt test or the testkit |
| `packages/contracts/src/inference/kinds.ts#MODEL_KINDS` (exports) | as const tuple behind a derived union (packages/contracts/src/inference/kinds.ts:9) |
| `packages/contracts/src/inference/modalities.ts#MODALITIES` (exports) | as const tuple behind a derived union (packages/contracts/src/inference/modalities.ts:9) |
| `packages/contracts/src/inference/providers.ts#builtinProviderDefSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/inference/resolved.ts#UNAVAILABLE_CAUSES` (exports) | as const tuple behind a derived union (packages/contracts/src/inference/resolved.ts:67) |
| `packages/contracts/src/inference/tokenize.ts#wordTokensSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/inference/usage.ts#RESPONSE_CACHE_STATUSES` (exports) | as const tuple behind a derived union (packages/contracts/src/inference/usage.ts:35) |
| `packages/contracts/src/inference/usage.ts#tokenUsageSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/inference/wire-limits.ts#WIRE_SCHEMA_CEILINGS` (exports) | as const tuple behind a derived union (packages/contracts/src/inference/wire-limits.ts:19) |
| `packages/contracts/src/inference/wire-limits.ts#structuredSchemaComplexity` (exports) | name read by tooling, scripts or root config (scripts/probes/rpg-extraction/structured-state-round.ts:22) |
| `packages/contracts/src/inference/wire-subset.ts#STRUCTURED_VEHICLES` (exports) | as const tuple behind a derived union (packages/contracts/src/inference/wire-subset.ts:17); name read by tooling, scripts or root config (tooling/src/verify/gates/structured-plan-one-home.ts:4) |
| `packages/contracts/src/persona/index.ts#personaMetadataWriteSchema` (exports) | name read by tooling, scripts or root config (tooling/src/verify/lib/reviewed-grants-zoderrorissues-zindex.ts:12); module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/plugin/host-v1.ts#UI_PROXYABLE_HOST_FUNCTIONS` (exports) | as const tuple behind a derived union (packages/contracts/src/plugin/host-v1.ts:962); name read by tooling, scripts or root config (scripts/generate-plugin-author-support.ts:15) |
| `packages/contracts/src/plugin/index.ts#PLUGIN_ANCHOR_TIERS` (exports) | name read by tooling, scripts or root config (scripts/generate-plugin-author-support.ts:9); dispatch table |
| `packages/contracts/src/plugin/index.ts#PLUGIN_BADGE_INTENTS` (exports) | as const tuple behind a derived union (packages/contracts/src/plugin/ui.ts:83) |
| `packages/contracts/src/plugin/index.ts#PLUGIN_BUTTON_VARIANTS` (exports) | as const tuple behind a derived union (packages/contracts/src/plugin/ui.ts:102) |
| `packages/contracts/src/plugin/index.ts#PLUGIN_COMMAND_ARG_TYPES` (exports) | as const tuple behind a derived union (packages/contracts/src/plugin/ui.ts:1495) |
| `packages/contracts/src/plugin/index.ts#PLUGIN_COMMAND_PLACEMENT_TARGETS` (exports) | as const tuple behind a derived union (packages/contracts/src/plugin/ui.ts:1469); name read by tooling, scripts or root config (scripts/generate-plugin-author-support.ts:11); named in law (docs/law/plugin-system.md) |
| `packages/contracts/src/plugin/index.ts#PLUGIN_FOOTER_NODE_KIND_ALLOWED` (exports) | dispatch table |
| `packages/contracts/src/plugin/index.ts#PLUGIN_GAP_TOKENS` (exports) | as const tuple behind a derived union (packages/contracts/src/plugin/ui.ts:71) |
| `packages/contracts/src/plugin/index.ts#PLUGIN_ICON_NAMES` (exports) | as const tuple behind a derived union (packages/contracts/src/plugin/ui.ts:167) |
| `packages/contracts/src/plugin/index.ts#PLUGIN_IMAGE_ASPECTS` (exports) | as const tuple behind a derived union (packages/contracts/src/plugin/ui.ts:109) |
| `packages/contracts/src/plugin/index.ts#PLUGIN_NODE_KINDS` (exports) | as const tuple behind a derived union (packages/contracts/src/plugin/ui.ts:207) |
| `packages/contracts/src/plugin/index.ts#PLUGIN_PAGE_STAGE_KINDS` (exports) | as const tuple behind a derived union (packages/contracts/src/plugin/ui.ts:174) |
| `packages/contracts/src/plugin/index.ts#PLUGIN_SELECT_HOST_SOURCES` (exports) | as const tuple behind a derived union (packages/contracts/src/plugin/ui.ts:571) |
| `packages/contracts/src/plugin/index.ts#PLUGIN_SUGGESTED_ACT_KINDS` (exports) | as const tuple behind a derived union (packages/contracts/src/plugin/suggestion.ts:39) |
| `packages/contracts/src/plugin/index.ts#PLUGIN_SURFACE_ANCHORS` (exports) | as const tuple behind a derived union (packages/contracts/src/plugin/ui.ts:50); name read by tooling, scripts or root config (scripts/generate-plugin-author-support.ts:12) |
| `packages/contracts/src/plugin/index.ts#PLUGIN_TEXT_VOICES` (exports) | as const tuple behind a derived union (packages/contracts/src/plugin/ui.ts:77) |
| `packages/contracts/src/plugin/index.ts#PLUGIN_TIER_REGISTRARS` (exports) | as const tuple behind a derived union (packages/contracts/src/plugin/ui.ts:301) |
| `packages/contracts/src/plugin/index.ts#UI_PROXYABLE_HOST_FUNCTIONS` (exports) | as const tuple behind a derived union (packages/contracts/src/plugin/host-v1.ts:962); name read by tooling, scripts or root config (scripts/generate-plugin-author-support.ts:15) |
| `packages/contracts/src/plugin/suggestion.ts#PLUGIN_SUGGESTED_ACT_KINDS` (exports) | as const tuple behind a derived union (packages/contracts/src/plugin/suggestion.ts:39) |
| `packages/contracts/src/plugin/ui.ts#PLUGIN_ANCHOR_TIERS` (exports) | name read by tooling, scripts or root config (scripts/generate-plugin-author-support.ts:9); dispatch table |
| `packages/contracts/src/plugin/ui.ts#PLUGIN_BADGE_INTENTS` (exports) | as const tuple behind a derived union (packages/contracts/src/plugin/ui.ts:83) |
| `packages/contracts/src/plugin/ui.ts#PLUGIN_BUTTON_VARIANTS` (exports) | as const tuple behind a derived union (packages/contracts/src/plugin/ui.ts:102) |
| `packages/contracts/src/plugin/ui.ts#PLUGIN_COMMAND_ARG_TYPES` (exports) | as const tuple behind a derived union (packages/contracts/src/plugin/ui.ts:1495) |
| `packages/contracts/src/plugin/ui.ts#PLUGIN_COMMAND_PLACEMENT_TARGETS` (exports) | as const tuple behind a derived union (packages/contracts/src/plugin/ui.ts:1469); name read by tooling, scripts or root config (scripts/generate-plugin-author-support.ts:11); named in law (docs/law/plugin-system.md) |
| `packages/contracts/src/plugin/ui.ts#PLUGIN_FOOTER_NODE_KIND_ALLOWED` (exports) | dispatch table |
| `packages/contracts/src/plugin/ui.ts#PLUGIN_GAP_TOKENS` (exports) | as const tuple behind a derived union (packages/contracts/src/plugin/ui.ts:71) |
| `packages/contracts/src/plugin/ui.ts#PLUGIN_ICON_NAMES` (exports) | as const tuple behind a derived union (packages/contracts/src/plugin/ui.ts:167) |
| `packages/contracts/src/plugin/ui.ts#PLUGIN_IMAGE_ASPECTS` (exports) | as const tuple behind a derived union (packages/contracts/src/plugin/ui.ts:109) |
| `packages/contracts/src/plugin/ui.ts#PLUGIN_NODE_KINDS` (exports) | as const tuple behind a derived union (packages/contracts/src/plugin/ui.ts:207) |
| `packages/contracts/src/plugin/ui.ts#PLUGIN_PAGE_STAGE_KINDS` (exports) | as const tuple behind a derived union (packages/contracts/src/plugin/ui.ts:174) |
| `packages/contracts/src/plugin/ui.ts#PLUGIN_SELECT_HOST_SOURCES` (exports) | as const tuple behind a derived union (packages/contracts/src/plugin/ui.ts:571) |
| `packages/contracts/src/plugin/ui.ts#PLUGIN_SURFACE_ANCHORS` (exports) | as const tuple behind a derived union (packages/contracts/src/plugin/ui.ts:50); name read by tooling, scripts or root config (scripts/generate-plugin-author-support.ts:12) |
| `packages/contracts/src/plugin/ui.ts#PLUGIN_TEXT_VOICES` (exports) | as const tuple behind a derived union (packages/contracts/src/plugin/ui.ts:77) |
| `packages/contracts/src/plugin/ui.ts#PLUGIN_TIER_REGISTRARS` (exports) | as const tuple behind a derived union (packages/contracts/src/plugin/ui.ts:301) |
| `packages/contracts/src/plugin/ui.ts#pluginBoundGridTileSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/plugin/ui.ts#pluginBoundKeyValueRowSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/plugin/ui.ts#pluginBoundSelectOptionSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/plugin/ui.ts#pluginSurfaceNodeSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/portability/index.ts#PORTABLE_PARSE_FAILURES` (exports) | as const tuple behind a derived union (packages/contracts/src/portability/index.ts:111) |
| `packages/contracts/src/preset/index.ts#CARRY_REASONING_MODES` (exports) | as const tuple behind a derived union (packages/contracts/src/preset/index.ts:314) |
| `packages/contracts/src/preset/index.ts#CHAT_ONLY_INTENT_FIELDS` (exports) | as const tuple behind a derived union (packages/contracts/src/preset/index.ts:570); named in law (docs/adr/0299-each-model-role-picks-its-preset.md) |
| `packages/contracts/src/preset/index.ts#CLAUDE_ISOLATION_PIN_KEYS` (exports) | as const tuple behind a derived union (packages/contracts/src/preset/index.ts:96) |
| `packages/contracts/src/preset/index.ts#PLAIN_MARKERS` (exports) | as const tuple behind a derived union (packages/contracts/src/preset/index.ts:957) |
| `packages/contracts/src/preset/index.ts#POST_PROCESS_LANE` (exports) | dispatch table |
| `packages/contracts/src/preset/index.ts#REPLY_MEDIA` (exports) | as const tuple behind a derived union (packages/contracts/src/preset/index.ts:515) |
| `packages/contracts/src/preset/index.ts#ROLE_PRESET_FIELDS` (exports) | as const tuple behind a derived union (packages/contracts/src/preset/index.ts:583); named in law (docs/adr/0299-each-model-role-picks-its-preset.md) |
| `packages/contracts/src/preset/index.ts#SIDE_GEN_KINDS` (exports) | as const tuple behind a derived union (packages/contracts/src/preset/index.ts:209) |
| `packages/contracts/src/preset/index.ts#effortLevelSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/preset/index.ts#generationKnobSchemas` (exports) | name read by tooling, scripts or root config (tooling/src/ast/lib/fields.ts:64) |
| `packages/contracts/src/preset/index.ts#guidedActionConfigSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/preset/index.ts#guidedActionsSchema` (exports) | imported by a rebuilt test or the testkit; module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/preset/index.ts#importStChatCompletionPreset` (exports) | named in law (packages/contracts/src/preset/index.ts:3441) |
| `packages/contracts/src/preset/index.ts#promptSectionSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/preset/index.ts#userMacroInputValueSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/prose-slot/index.ts#PROSE_HOMES` (exports) | as const tuple behind a derived union (packages/contracts/src/prose-slot/index.ts:19) |
| `packages/contracts/src/prose-slot/index.ts#PROSE_MACRO_MODES` (exports) | as const tuple behind a derived union (packages/contracts/src/prose-slot/index.ts:25) |
| `packages/contracts/src/prose-slot/index.ts#proseOverrideSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/prose/index.ts#PRESET_PROSE_SLOT_IDS` (exports) | named in law (docs/adr/0132-model-facing-prose-is-a-registry-of-slots.md) |
| `packages/contracts/src/prose/index.ts#PROSE_HOMES` (exports) | as const tuple behind a derived union (packages/contracts/src/prose-slot/index.ts:19) |
| `packages/contracts/src/prose/index.ts#PROSE_MACRO_MODES` (exports) | as const tuple behind a derived union (packages/contracts/src/prose-slot/index.ts:25) |
| `packages/contracts/src/prose/index.ts#PROSE_SLOT_IDS` (exports) | as const tuple behind a derived union (packages/contracts/src/prose-slot/index.ts:270); name read by tooling, scripts or root config (tooling/src/verify/ops/gen/prose.ts:15) |
| `packages/contracts/src/prose/index.ts#proseOverrideFromLegacy` (exports) | imported by a rebuilt test or the testkit |
| `packages/contracts/src/prose/index.ts#spliceProseTokens` (exports) | named in law (packages/contracts/src/prose-slot/index.ts:405) |
| `packages/contracts/src/providers/index.ts#embedResultSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/providers/index.ts#imageEmbedResultSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/providers/index.ts#rerankHitSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/providers/index.ts#rerankResultSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/providers/index.ts#summarizeResultItemSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/providers/index.ts#summarizeResultSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/refinery/index.ts#LIST_MAX` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/bounded-list-limit.ts:205) |
| `packages/contracts/src/refinery/index.ts#REFINERY_ANALYZE_MODES` (exports) | as const tuple behind a derived union (packages/contracts/src/refinery/index.ts:197) |
| `packages/contracts/src/refinery/index.ts#REFINERY_REWRITE_MODES` (exports) | as const tuple behind a derived union (packages/contracts/src/refinery/index.ts:193) |
| `packages/contracts/src/refinery/index.ts#REFINERY_SCORE_MODES` (exports) | imported by a rebuilt test or the testkit; as const tuple behind a derived union (packages/contracts/src/refinery/index.ts:189) |
| `packages/contracts/src/refinery/index.ts#REFINERY_VERDICTS` (exports) | as const tuple behind a derived union (packages/contracts/src/refinery/core.ts:17) |
| `packages/contracts/src/refinery/index.ts#payloadSchemaFor` (exports) | named in law (packages/contracts/src/refinery/index.ts:533) |
| `packages/contracts/src/refinery/index.ts#refineryAnalyzeModeSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/refinery/index.ts#refineryRewriteDecisionSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/refinery/index.ts#refineryRewriteModeSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/refinery/index.ts#refineryRewritePayloadSchema` (exports) | module-level contract schema (contract-structural-copy reads it); named in law (packages/contracts/src/refinery/index.ts:482) |
| `packages/contracts/src/refinery/index.ts#refineryRunSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/refinery/index.ts#refineryScoreModeSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/refinery/index.ts#refineryScorePayloadSchema` (exports) | imported by a rebuilt test or the testkit; module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/refinery/index.ts#stagePreflightSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/refinery/schema-advisory.ts#REFINERY_ADVISORY_CODES` (exports) | as const tuple behind a derived union (packages/contracts/src/refinery/schema-advisory.ts:12) |
| `packages/contracts/src/refinery/schema-authoring.ts#renderHintSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/refinery/schema-forge.ts#FORGE_FIELD_TYPES` (exports) | as const tuple behind a derived union (packages/contracts/src/refinery/schema-forge.ts:98) |
| `packages/contracts/src/refinery/schema-forge.ts#REFINERY_FORGE_CORE_NODES` (exports) | dispatch table |
| `packages/contracts/src/refinery/schema-forge.ts#forgeFieldRowSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/refinery/schema-forge.ts#forgeHintRowSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/refinery/schema-plan.ts#REFINERY_SCHEMA_CARRIERS` (exports) | as const tuple behind a derived union (packages/contracts/src/refinery/schema-plan.ts:16) |
| `packages/contracts/src/regex/index.ts#regexHistoryDepthSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/role-clients/index.ts#ROLE_CLIENT_TASKS` (exports) | imported by a rebuilt test or the testkit; as const tuple behind a derived union (packages/contracts/src/role-clients/index.ts:107) |
| `packages/contracts/src/role-clients/index.ts#responseFormatSchema` (exports) | name read by tooling, scripts or root config (packages/contracts/src/role-clients/index.ts:1); module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/roster-preset/index.ts#ROSTER_PRESET_MEMBER_MAX` (exports) | named in law (packages/contracts/src/roster-preset/index.ts:139) |
| `packages/contracts/src/roster-preset/index.ts#rosterPresetMemberSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/roster-preset/index.ts#rosterPresetMemberViewSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/roster-preset/index.ts#rosterPresetMembersSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/roster-preset/index.ts#rosterPresetRuleSkipSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/roster-preset/index.ts#rosterPresetRuleViewSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/roster-preset/index.ts#rosterPresetRulesSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/rpg/actor.ts#RPG_ACTOR_IDENTITY_TEXT_FIELDS` (exports) | as const tuple behind a derived union (packages/contracts/src/rpg/actor.ts:381) |
| `packages/contracts/src/rpg/actor.ts#RPG_ACTOR_OP_FIELDS` (exports) | as const tuple behind a derived union (packages/contracts/src/rpg/actor.ts:343) |
| `packages/contracts/src/rpg/actor.ts#rpgInventoryItemSchema` (exports) | imported by a rebuilt test or the testkit; module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/rpg/actor.ts#rpgRelationshipSchema` (exports) | imported by a rebuilt test or the testkit; module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/rpg/ambient.ts#TIME_OF_DAY_RANGES` (exports) | dispatch table |
| `packages/contracts/src/rpg/enums.ts#RPG_QUEST_STATUSES` (exports) | as const tuple behind a derived union (packages/contracts/src/rpg/enums.ts:25) |
| `packages/contracts/src/rpg/enums.ts#RPG_TRACKER_CARRIER_CLASSES` (exports) | as const tuple behind a derived union (packages/contracts/src/rpg/enums.ts:76) |
| `packages/contracts/src/rpg/enums.ts#RPG_TRACKER_SHAPES` (exports) | as const tuple behind a derived union (packages/contracts/src/rpg/enums.ts:55) |
| `packages/contracts/src/rpg/enums.ts#RPG_TRACKER_SUBJECTS` (exports) | as const tuple behind a derived union (packages/contracts/src/rpg/enums.ts:69) |
| `packages/contracts/src/rpg/enums.ts#RPG_TRACKER_WRITES` (exports) | as const tuple behind a derived union (packages/contracts/src/rpg/enums.ts:63) |
| `packages/contracts/src/rpg/extraction-prompt.ts#EXTRACTION_PLANE_PROMPTS` (exports) | named in law (docs/adr/0111-the-rpg-state-round-reads-the-story-the.md) |
| `packages/contracts/src/rpg/extraction-prompt.ts#buildRpgToolDescriptions` (exports) | named in law (docs/adr/0113-the-tracker-is-the-one-tracked-field-concept.md) |
| `packages/contracts/src/rpg/extraction.ts#RPG_TOOL_CALL_VERDICTS` (exports) | as const tuple behind a derived union (packages/contracts/src/rpg/extraction.ts:953) |
| `packages/contracts/src/rpg/extraction.ts#rpgPopulateSheetSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/rpg/index.ts#EXTRACTION_PLANE_PROMPTS` (exports) | named in law (docs/adr/0111-the-rpg-state-round-reads-the-story-the.md) |
| `packages/contracts/src/rpg/index.ts#MODE_POLICY` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/message-kind-policy-coverage.ts:26); dispatch table; named in law (docs/adr/0086-the-rpg-stat-profile-spine-the-lite-full.md) |
| `packages/contracts/src/rpg/index.ts#RPG_ACTOR_IDENTITY_TEXT_FIELDS` (exports) | as const tuple behind a derived union (packages/contracts/src/rpg/actor.ts:381) |
| `packages/contracts/src/rpg/index.ts#RPG_ACTOR_OP_FIELDS` (exports) | as const tuple behind a derived union (packages/contracts/src/rpg/actor.ts:343) |
| `packages/contracts/src/rpg/index.ts#RPG_BUS_EVENT_TYPES` (exports) | as const tuple behind a derived union (packages/contracts/src/rpg/bus.ts:78); name read by tooling, scripts or root config (tooling/src/verify/gates/bus-belt-total.ts:99) |
| `packages/contracts/src/rpg/index.ts#RPG_DELIVERY_PATHS` (exports) | as const tuple behind a derived union (packages/contracts/src/rpg/config.ts:148) |
| `packages/contracts/src/rpg/index.ts#RPG_FLUSH_OUTCOMES` (exports) | as const tuple behind a derived union (packages/contracts/src/rpg/trace.ts:22) |
| `packages/contracts/src/rpg/index.ts#RPG_FOLD_FALLBACK_REASONS` (exports) | as const tuple behind a derived union (packages/contracts/src/rpg/config.ts:136) |
| `packages/contracts/src/rpg/index.ts#RPG_LITE_TOOL_NAMES` (exports) | imported by a rebuilt test or the testkit; as const tuple behind a derived union (packages/contracts/src/rpg/tools.ts:41) |
| `packages/contracts/src/rpg/index.ts#RPG_PROFILE_FREEFORM` (exports) | name read by tooling, scripts or root config (scripts/probes/prose-with-tools/probe.ts:35); named in law (docs/adr/0281-rpg-profiles-follow-live-rulesets.md) |
| `packages/contracts/src/rpg/index.ts#RPG_QUEST_ACTIONS` (exports) | as const tuple behind a derived union (packages/contracts/src/rpg/tools.ts:200) |
| `packages/contracts/src/rpg/index.ts#RPG_QUEST_STATUSES` (exports) | as const tuple behind a derived union (packages/contracts/src/rpg/enums.ts:25) |
| `packages/contracts/src/rpg/index.ts#RPG_STATE_CHANGES_FIELD` (exports) | imported by a rebuilt test or the testkit |
| `packages/contracts/src/rpg/index.ts#RPG_TOOL_CALL_VERDICTS` (exports) | as const tuple behind a derived union (packages/contracts/src/rpg/extraction.ts:953) |
| `packages/contracts/src/rpg/index.ts#RPG_TOOL_CALL_WITHHOLD_REASONS` (exports) | as const tuple behind a derived union (packages/contracts/src/rpg/views.ts:234) |
| `packages/contracts/src/rpg/index.ts#RPG_TRACKER_CARRIER_CLASSES` (exports) | as const tuple behind a derived union (packages/contracts/src/rpg/enums.ts:76) |
| `packages/contracts/src/rpg/index.ts#RPG_TRACKER_SHAPES` (exports) | as const tuple behind a derived union (packages/contracts/src/rpg/enums.ts:55) |
| `packages/contracts/src/rpg/index.ts#RPG_TRACKER_SUBJECTS` (exports) | as const tuple behind a derived union (packages/contracts/src/rpg/enums.ts:69) |
| `packages/contracts/src/rpg/index.ts#RPG_TRACKER_WRITES` (exports) | as const tuple behind a derived union (packages/contracts/src/rpg/enums.ts:63) |
| `packages/contracts/src/rpg/index.ts#TIME_OF_DAY_RANGES` (exports) | dispatch table |
| `packages/contracts/src/rpg/index.ts#buildRpgToolDescriptions` (exports) | named in law (docs/adr/0113-the-tracker-is-the-one-tracked-field-concept.md) |
| `packages/contracts/src/rpg/index.ts#carriesTracker` (exports) | named in law (docs/adr/0113-the-tracker-is-the-one-tracked-field-concept.md) |
| `packages/contracts/src/rpg/index.ts#patchFieldPaths` (exports) | @public TSDoc |
| `packages/contracts/src/rpg/index.ts#patchToolsOnlyFields` (exports) | @public TSDoc |
| `packages/contracts/src/rpg/index.ts#rpgActorIdentitySchema` (exports) | imported by a rebuilt test or the testkit |
| `packages/contracts/src/rpg/index.ts#rpgActorVolatileSchema` (exports) | imported by a rebuilt test or the testkit |
| `packages/contracts/src/rpg/index.ts#rpgGameFeaturesSchema` (exports) | imported by a rebuilt test or the testkit |
| `packages/contracts/src/rpg/index.ts#rpgInventoryItemSchema` (exports) | imported by a rebuilt test or the testkit |
| `packages/contracts/src/rpg/index.ts#rpgRelationshipSchema` (exports) | imported by a rebuilt test or the testkit |
| `packages/contracts/src/rpg/index.ts#rpgTraceEventSchema` (exports) | imported by a rebuilt test or the testkit |
| `packages/contracts/src/rpg/index.ts#rpgTrackerValueSchema` (exports) | imported by a rebuilt test or the testkit |
| `packages/contracts/src/rpg/index.ts#trackerGloss` (exports) | named in law (docs/adr/0113-the-tracker-is-the-one-tracked-field-concept.md) |
| `packages/contracts/src/rpg/mode.ts#MODE_POLICY` (exports) | name read by tooling, scripts or root config (tooling/src/verify/gates/message-kind-policy-coverage.ts:26); dispatch table; named in law (docs/adr/0086-the-rpg-stat-profile-spine-the-lite-full.md) |
| `packages/contracts/src/rpg/profile.ts#rpgStatAttributeDefSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/rpg/profile.ts#rpgStatResolutionSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/rpg/snapshot.ts#rpgPlotActSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/rpg/tools.ts#RPG_QUEST_ACTIONS` (exports) | as const tuple behind a derived union (packages/contracts/src/rpg/tools.ts:200) |
| `packages/contracts/src/rpg/trace.ts#RPG_FLUSH_OUTCOMES` (exports) | as const tuple behind a derived union (packages/contracts/src/rpg/trace.ts:22) |
| `packages/contracts/src/rpg/trace.ts#rpgTraceEventSchema` (exports) | imported by a rebuilt test or the testkit; module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/rpg/tracker.ts#carriesTracker` (exports) | named in law (docs/adr/0113-the-tracker-is-the-one-tracked-field-concept.md) |
| `packages/contracts/src/rpg/tracker.ts#rpgTrackerAppliesToSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/rpg/tracker.ts#trackerGloss` (exports) | named in law (docs/adr/0113-the-tracker-is-the-one-tracked-field-concept.md) |
| `packages/contracts/src/rpg/views.ts#RPG_TOOL_CALL_WITHHOLD_REASONS` (exports) | as const tuple behind a derived union (packages/contracts/src/rpg/views.ts:234) |
| `packages/contracts/src/search/index.ts#CORPUS_SOURCE_OUTCOMES` (exports) | as const tuple behind a derived union (packages/contracts/src/search/source.ts:34) |
| `packages/contracts/src/search/index.ts#blockKeySchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/search/index.ts#characterCardHitSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/search/index.ts#corpusHitSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/search/index.ts#digestSearchHitSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/search/index.ts#digestSourceHitSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/search/index.ts#discoverCharacterSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/search/index.ts#discoverResultSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/search/index.ts#discoverSegmentSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/search/index.ts#documentChunkHitSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/search/index.ts#fieldSearchHitSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/search/index.ts#imageSearchHitSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/search/index.ts#scoredBlockSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/search/index.ts#searchHitSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/search/index.ts#segmentSearchHitSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/search/index.ts#unifiedSearchRowsSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/settings/appearance.ts#SURFACE_TEXTURES` (exports) | as const tuple behind a derived union (packages/contracts/src/settings/appearance.ts:87) |
| `packages/contracts/src/settings/index.ts#BACKGROUND_DIM_MIN` (exports) | named in law (docs/adr/0144-the-reading-surface-derive-law-one-palette-root.md) |
| `packages/contracts/src/settings/index.ts#SURFACE_TEXTURES` (exports) | as const tuple behind a derived union (packages/contracts/src/settings/appearance.ts:87) |
| `packages/contracts/src/settings/index.ts#appearanceSettingsSchema` (exports) | name read by tooling, scripts or root config (tooling/src/floor/appearance/appearance-flags.ts:7) |
| `packages/contracts/src/settings/index.ts#logLevelSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/settings/index.ts#memoryDefaultsSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/settings/index.ts#rateLimitsSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/settings/index.ts#resolvedRateLimitsSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/settings/index.ts#rolePresetChoiceSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/settings/index.ts#userSettingsSchema` (exports) | imported by a rebuilt test or the testkit; name read by tooling, scripts or root config (tooling/src/verify/gates/knob-wire-coverage.ts:205); module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/stats/index.ts#extraStatsSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/stats/index.ts#leaderboardRowSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/stats/index.ts#statsDeltaSchema` (exports) | name read by tooling, scripts or root config (tooling/src/ast/lib/fields.ts:73); module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/stream/index.ts#STREAM_CHANNELS` (exports) | named in law (docs/adr/0118-all-server-client-streaming-rides-one-multiplexed-sse.md) |
| `packages/contracts/src/stream/index.ts#streamRoomRefSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/tag/index.ts#tagAttachedEntitySchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/tag/index.ts#tagUsageSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/theme/index.ts#BACKGROUND_MATERIALIZE_FAILURES` (exports) | as const tuple behind a derived union (packages/contracts/src/theme/materialize.ts:24) |
| `packages/contracts/src/theme/index.ts#CARD_EMBEDDABLE_THEME_KEYS` (exports) | named in law (docs/adr/0123-theme-doors-the-card-embeddable-appearance-partition-td.md) |
| `packages/contracts/src/theme/index.ts#THEME_KEY_REACHES` (exports) | as const tuple behind a derived union (packages/contracts/src/theme/override.ts:97) |
| `packages/contracts/src/theme/index.ts#VIEWER_SACRED_THEME_KEYS` (exports) | named in law (docs/adr/0123-theme-doors-the-card-embeddable-appearance-partition-td.md) |
| `packages/contracts/src/theme/index.ts#themeSchema` (exports) | module-level contract schema (contract-structural-copy reads it); named in law (docs/law/vocabulary-map.md) |
| `packages/contracts/src/theme/materialize.ts#BACKGROUND_MATERIALIZE_FAILURES` (exports) | as const tuple behind a derived union (packages/contracts/src/theme/materialize.ts:24) |
| `packages/contracts/src/theme/override.ts#CARD_EMBEDDABLE_THEME_KEYS` (exports) | named in law (docs/adr/0123-theme-doors-the-card-embeddable-appearance-partition-td.md) |
| `packages/contracts/src/theme/override.ts#THEME_KEY_REACHES` (exports) | as const tuple behind a derived union (packages/contracts/src/theme/override.ts:97) |
| `packages/contracts/src/theme/override.ts#VIEWER_SACRED_THEME_KEYS` (exports) | named in law (docs/adr/0123-theme-doors-the-card-embeddable-appearance-partition-td.md) |
| `packages/contracts/src/workloads/execution.ts#WORKLOAD_RESUME_POLICIES` (exports) | as const tuple behind a derived union (packages/contracts/src/workloads/execution.ts:27); named in law (docs/adr/0117-domain-workloads-is-a-generic-execution-substrate-with.md) |
| `packages/contracts/src/workloads/index.ts#WORKLOAD_RESUME_POLICIES` (exports) | as const tuple behind a derived union (packages/contracts/src/workloads/execution.ts:27); named in law (docs/adr/0117-domain-workloads-is-a-generic-execution-substrate-with.md) |
| `packages/contracts/src/workloads/views.ts#workloadPoisonRowSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/workloads/views.ts#workloadProgressSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/workloads/views.ts#workloadRunnableRowSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/world-info/index.ts#INHERITED_BOOK_SOURCES` (exports) | as const tuple behind a derived union (packages/contracts/src/world-info/index.ts:177) |
| `packages/contracts/src/world-info/index.ts#WORLD_INFO_SCOPES` (exports) | as const tuple behind a derived union (packages/contracts/src/world-info/index.ts:30); name read by tooling, scripts or root config (tooling/src/verify/lib/union-axis.ts:27) |
| `packages/contracts/src/world-info/index.ts#bookUsageSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/world-info/index.ts#entryMetadataWriteSchema` (exports) | name read by tooling, scripts or root config (tooling/src/verify/lib/reviewed-grants-zoderrorissues-zindex.ts:68); module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/world-info/index.ts#loreEntryProvenanceSchema` (exports) | name read by tooling, scripts or root config (tooling/src/ast/lib/fields.ts:442); module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/world-info/index.ts#worldInfoScopeSchema` (exports) | module-level contract schema (contract-structural-copy reads it) |
| `packages/contracts/src/automation/index.ts#RewriteCardDetail` (types) | type used in an exported signature (packages/contracts/src/automation/index.ts:914) |
| `packages/contracts/src/automation/index.ts#RulePresetEntityRefValueOf` (types) | type used in an exported signature (packages/contracts/src/automation/presets.ts:128); @public TSDoc |
| `packages/contracts/src/automation/index.ts#RulePresetKnobKind` (types) | derived union of an as const tuple; @public TSDoc |
| `packages/contracts/src/automation/presets.ts#RulePresetKnobKind` (types) | derived union of an as const tuple |
| `packages/contracts/src/chat/assemble.ts#AssembleDepthNote` (types) | type used in an exported signature (packages/contracts/src/chat/assemble.ts:53) |
| `packages/contracts/src/chat/assemble.ts#ContextLimitKind` (types) | derived union of an as const tuple; type used in an exported signature (packages/contracts/src/chat/assemble.ts:302) |
| `packages/contracts/src/chat/assemble.ts#SentPrompt` (types) | type used in an exported signature (packages/contracts/src/chat/assemble.ts:579) |
| `packages/contracts/src/chat/bus.ts#PromptTransformAbort` (types) | type used in an exported signature (packages/contracts/src/chat/bus.ts:380) |
| `packages/contracts/src/chat/bus.ts#ProviderAdjustmentKind` (types) | derived union of an as const tuple; type used in an exported signature (packages/contracts/src/chat/bus.ts:263) |
| `packages/contracts/src/chat/content-classes.ts#ContentClassPolicy` (types) | type used in an exported signature (packages/contracts/src/chat/content-classes.ts:55) |
| `packages/contracts/src/chat/index.ts#AcceptInviteInput` (types) | @public TSDoc |
| `packages/contracts/src/chat/index.ts#AssembleDepthNote` (types) | type used in an exported signature (packages/contracts/src/chat/assemble.ts:53) |
| `packages/contracts/src/chat/index.ts#CarriedAppearanceMember` (types) | type used in an exported signature (packages/contracts/src/chat/roster.ts:379) |
| `packages/contracts/src/chat/index.ts#CarriedBackground` (types) | type used in an exported signature (packages/contracts/src/chat/roster.ts:450) |
| `packages/contracts/src/chat/index.ts#ChatCharacterIdentity` (types) | type used in an exported signature (packages/contracts/src/chat/producers.ts:53) |
| `packages/contracts/src/chat/index.ts#ChatPersonaIdentity` (types) | type used in an exported signature (packages/contracts/src/chat/producers.ts:53) |
| `packages/contracts/src/chat/index.ts#ContentClassPolicy` (types) | type used in an exported signature (packages/contracts/src/chat/content-classes.ts:55) |
| `packages/contracts/src/chat/index.ts#ContextLimitKind` (types) | derived union of an as const tuple; type used in an exported signature (packages/contracts/src/chat/assemble.ts:302) |
| `packages/contracts/src/chat/index.ts#InviteStatus` (types) | derived union of an as const tuple; type used in an exported signature (packages/contracts/src/chat/roster.ts:596) |
| `packages/contracts/src/chat/index.ts#NarratorGroupPolicy` (types) | type used in an exported signature (packages/contracts/src/chat/metadata.ts:75) |
| `packages/contracts/src/chat/index.ts#PendingJoinConfirmResult` (types) | @public TSDoc |
| `packages/contracts/src/chat/index.ts#PromptTransformAbort` (types) | type used in an exported signature (packages/contracts/src/chat/bus.ts:380) |
| `packages/contracts/src/chat/index.ts#ProviderAdjustmentKind` (types) | derived union of an as const tuple; type used in an exported signature (packages/contracts/src/chat/bus.ts:263) |
| `packages/contracts/src/chat/index.ts#RegexTierAllow` (types) | type used in an exported signature (packages/contracts/src/chat/regex-tiers.ts:80) |
| `packages/contracts/src/chat/index.ts#RosterMemberSpec` (types) | @public TSDoc; name read by tooling, scripts or root config (tooling/src/verify/gates/contract-derives-not-respells.ts:190) |
| `packages/contracts/src/chat/index.ts#SentPrompt` (types) | type used in an exported signature (packages/contracts/src/chat/assemble.ts:579) |
| `packages/contracts/src/chat/index.ts#SignupResult` (types) | @public TSDoc |
| `packages/contracts/src/chat/index.ts#TurnAbortedOpCode` (types) | @public TSDoc |
| `packages/contracts/src/chat/index.ts#TurnLockedOpCode` (types) | @public TSDoc |
| `packages/contracts/src/chat/index.ts#UserMacroUnknownPickOpCode` (types) | @public TSDoc |
| `packages/contracts/src/chat/roster.ts#CarriedAppearanceMember` (types) | type used in an exported signature (packages/contracts/src/chat/roster.ts:379) |
| `packages/contracts/src/chat/roster.ts#InviteStatus` (types) | derived union of an as const tuple; type used in an exported signature (packages/contracts/src/chat/roster.ts:596) |
| `packages/contracts/src/databank/index.ts#ChunkParamsPin` (types) | named in law (packages/contracts/src/databank/index.ts:151) |
| `packages/contracts/src/databank/index.ts#ChunkParamsWire` (types) | imported by a rebuilt test or the testkit; type used in an exported signature (packages/contracts/src/databank/index.ts:150) |
| `packages/contracts/src/events/index.ts#PersonaUpdatedEvent` (types) | type used in an exported signature (packages/contracts/src/events/index.ts:93); name read by tooling, scripts or root config (tooling/src/verify/lib/bus-payload-fact.ts:110) |
| `packages/contracts/src/events/index.ts#WorldInfoUpdatedEvent` (types) | type used in an exported signature (packages/contracts/src/events/index.ts:93); name read by tooling, scripts or root config (tooling/src/verify/lib/bus-payload-fact.ts:110) |
| `packages/contracts/src/extraction/index.ts#ExtractionMeta` (types) | type used in an exported signature (packages/contracts/src/extraction/index.ts:87) |
| `packages/contracts/src/identity/index.ts#ChatResource` (types) | type used in an exported signature (packages/contracts/src/identity/index.ts:379); name read by tooling, scripts or root config (eslint.config.js:688); named in law (docs/law/vocabulary-map.md) |
| `packages/contracts/src/identity/index.ts#GlobalResource` (types) | type used in an exported signature (packages/contracts/src/identity/index.ts:379); name read by tooling, scripts or root config (eslint.config.js:689) |
| `packages/contracts/src/inference/capability/capability.ts#KindDef` (types) | type used in an exported signature (packages/contracts/src/inference/capability/capability.ts:27) |
| `packages/contracts/src/inference/capability/capability.ts#KindDefs` (types) | type used in an exported signature (packages/contracts/src/inference/capability/capability.ts:33) |
| `packages/contracts/src/inference/wire-limits.ts#WireSchemaCeiling` (types) | derived union of an as const tuple |
| `packages/contracts/src/inference/wire-subset.ts#WireSchemaRefusal` (types) | type used in an exported signature (packages/contracts/src/inference/wire-subset.ts:413) |
| `packages/contracts/src/plugin/host-v1.ts#ChatHandle` (types) | type used in an exported signature (packages/contracts/src/plugin/host-v1.ts:226); named in law (docs/adr/0043-standing-meta-rules-from-neo-client-audit.md) |
| `packages/contracts/src/plugin/host-v1.ts#PluginVariableOp` (types) | type used in an exported signature (packages/contracts/src/plugin/host-v1.ts:246) |
| `packages/contracts/src/plugin/index.ts#ChatHandle` (types) | type used in an exported signature (packages/contracts/src/plugin/host-v1.ts:226); named in law (docs/adr/0043-standing-meta-rules-from-neo-client-audit.md) |
| `packages/contracts/src/plugin/index.ts#PluginBadgeIntent` (types) | derived union of an as const tuple; type used in an exported signature (packages/contracts/src/plugin/ui.ts:470) |
| `packages/contracts/src/plugin/index.ts#PluginBoundGridTile` (types) | type used in an exported signature (packages/contracts/src/plugin/ui.ts:1242) |
| `packages/contracts/src/plugin/index.ts#PluginBoundKeyValueRow` (types) | type used in an exported signature (packages/contracts/src/plugin/ui.ts:1332) |
| `packages/contracts/src/plugin/index.ts#PluginButtonVariant` (types) | derived union of an as const tuple; type used in an exported signature (packages/contracts/src/plugin/ui.ts:608) |
| `packages/contracts/src/plugin/index.ts#PluginCommandArgType` (types) | derived union of an as const tuple; type used in an exported signature (packages/contracts/src/plugin/ui.ts:1512) |
| `packages/contracts/src/plugin/index.ts#PluginCommandArgs` (types) | type used in an exported signature (packages/contracts/src/plugin/ui.ts:1541) |
| `packages/contracts/src/plugin/index.ts#PluginCommandArgsFor` (types) | type used in an exported signature (packages/contracts/src/plugin/ui.ts:1679) |
| `packages/contracts/src/plugin/index.ts#PluginFrameResult` (types) | type used in an exported signature (packages/contracts/src/plugin/frame.ts:187) |
| `packages/contracts/src/plugin/index.ts#PluginGapToken` (types) | derived union of an as const tuple; type used in an exported signature (packages/contracts/src/plugin/ui.ts:448) |
| `packages/contracts/src/plugin/index.ts#PluginImageAspect` (types) | derived union of an as const tuple; type used in an exported signature (packages/contracts/src/plugin/ui.ts:531) |
| `packages/contracts/src/plugin/index.ts#PluginPageStage` (types) | type used in an exported signature (packages/contracts/src/plugin/ui.ts:798) |
| `packages/contracts/src/plugin/index.ts#PluginPageStageKind` (types) | derived union of an as const tuple; type used in an exported signature (packages/contracts/src/plugin/ui.ts:765) |
| `packages/contracts/src/plugin/index.ts#PluginPrimaryArbitration` (types) | type used in an exported signature (packages/contracts/src/plugin/ui.ts:1825) |
| `packages/contracts/src/plugin/index.ts#PluginRowNode` (types) | type used in an exported signature (packages/contracts/src/plugin/ui.ts:826) |
| `packages/contracts/src/plugin/index.ts#PluginSectionNode` (types) | type used in an exported signature (packages/contracts/src/plugin/ui.ts:827) |
| `packages/contracts/src/plugin/index.ts#PluginSlug` (types) | type used in an exported signature (packages/contracts/src/plugin/manifest.ts:169) |
| `packages/contracts/src/plugin/index.ts#PluginStackNode` (types) | type used in an exported signature (packages/contracts/src/plugin/ui.ts:825) |
| `packages/contracts/src/plugin/index.ts#PluginStateBinding` (types) | type used in an exported signature (packages/contracts/src/plugin/ui.ts:435) |
| `packages/contracts/src/plugin/index.ts#PluginTextVoice` (types) | derived union of an as const tuple; type used in an exported signature (packages/contracts/src/plugin/ui.ts:465) |
| `packages/contracts/src/plugin/index.ts#PluginTierRegistrar` (types) | derived union of an as const tuple; type used in an exported signature (packages/contracts/src/plugin/ui.ts:306) |
| `packages/contracts/src/plugin/index.ts#PluginVariableOp` (types) | type used in an exported signature (packages/contracts/src/plugin/host-v1.ts:246) |
| `packages/contracts/src/plugin/ui.ts#PluginBadgeIntent` (types) | derived union of an as const tuple; type used in an exported signature (packages/contracts/src/plugin/ui.ts:470) |
| `packages/contracts/src/plugin/ui.ts#PluginButtonVariant` (types) | derived union of an as const tuple; type used in an exported signature (packages/contracts/src/plugin/ui.ts:608) |
| `packages/contracts/src/plugin/ui.ts#PluginCommandArgType` (types) | derived union of an as const tuple; type used in an exported signature (packages/contracts/src/plugin/ui.ts:1512) |
| `packages/contracts/src/plugin/ui.ts#PluginGapToken` (types) | derived union of an as const tuple; type used in an exported signature (packages/contracts/src/plugin/ui.ts:448) |
| `packages/contracts/src/plugin/ui.ts#PluginImageAspect` (types) | derived union of an as const tuple; type used in an exported signature (packages/contracts/src/plugin/ui.ts:531) |
| `packages/contracts/src/plugin/ui.ts#PluginPageStage` (types) | type used in an exported signature (packages/contracts/src/plugin/ui.ts:798) |
| `packages/contracts/src/plugin/ui.ts#PluginPageStageKind` (types) | derived union of an as const tuple; type used in an exported signature (packages/contracts/src/plugin/ui.ts:765) |
| `packages/contracts/src/plugin/ui.ts#PluginRowNode` (types) | type used in an exported signature (packages/contracts/src/plugin/ui.ts:826) |
| `packages/contracts/src/plugin/ui.ts#PluginSectionNode` (types) | type used in an exported signature (packages/contracts/src/plugin/ui.ts:827) |
| `packages/contracts/src/plugin/ui.ts#PluginStackNode` (types) | type used in an exported signature (packages/contracts/src/plugin/ui.ts:825) |
| `packages/contracts/src/plugin/ui.ts#PluginTextVoice` (types) | derived union of an as const tuple; type used in an exported signature (packages/contracts/src/plugin/ui.ts:465) |
| `packages/contracts/src/preset/index.ts#ChatOnlyIntentField` (types) | derived union of an as const tuple |
| `packages/contracts/src/preset/index.ts#FormatStringKey` (types) | type used in an exported signature (packages/contracts/src/preset/index.ts:1134) |
| `packages/contracts/src/preset/index.ts#RolePresetField` (types) | derived union of an as const tuple; type used in an exported signature (packages/contracts/src/preset/index.ts:589) |
| `packages/contracts/src/prose-slot/index.ts#ProseMacroMode` (types) | derived union of an as const tuple; type used in an exported signature (packages/contracts/src/prose-slot/index.ts:35) |
| `packages/contracts/src/prose/index.ts#ProseMacroMode` (types) | derived union of an as const tuple; type used in an exported signature (packages/contracts/src/prose-slot/index.ts:35) |
| `packages/contracts/src/refinery/index.ts#RefineryAnalyzeFixedConfig` (types) | type used in an exported signature (packages/contracts/src/refinery/index.ts:362) |
| `packages/contracts/src/refinery/index.ts#RefineryManualRewriteConfig` (types) | type used in an exported signature (packages/contracts/src/refinery/index.ts:364) |
| `packages/contracts/src/refinery/index.ts#RefineryRewriteConfig` (types) | type used in an exported signature (packages/contracts/src/refinery/index.ts:361) |
| `packages/contracts/src/refinery/index.ts#RefineryScoreFixedConfig` (types) | type used in an exported signature (packages/contracts/src/refinery/index.ts:360) |
| `packages/contracts/src/refinery/schema-advisory.ts#RefineryAdvisoryCode` (types) | derived union of an as const tuple; type used in an exported signature (packages/contracts/src/refinery/schema-advisory.ts:16) |
| `packages/contracts/src/refinery/schema-advisory.ts#RefinerySchemaAdvisory` (types) | type used in an exported signature (packages/contracts/src/refinery/schema-advisory.ts:34) |
| `packages/contracts/src/refinery/schema-advisory.ts#RefinerySchemaStats` (types) | type used in an exported signature (packages/contracts/src/refinery/schema-advisory.ts:33) |
| `packages/contracts/src/refinery/schema-forge.ts#ForgeFieldType` (types) | derived union of an as const tuple |
| `packages/contracts/src/refinery/schema-forge.ts#ForgeTranspileDrop` (types) | type used in an exported signature (packages/contracts/src/refinery/schema-forge.ts:274) |
| `packages/contracts/src/rpg/bus.ts#RpgBusEventType` (types) | derived union of an as const tuple |
| `packages/contracts/src/rpg/extraction-prompt.ts#ExtractionPlanePrompt` (types) | type used in an exported signature (packages/contracts/src/rpg/extraction-prompt.ts:129) |
| `packages/contracts/src/rpg/extraction.ts#RpgExtractionDrop` (types) | type used in an exported signature (packages/contracts/src/rpg/extraction.ts:591) |
| `packages/contracts/src/rpg/extraction.ts#RpgExtractionDropPlane` (types) | type used in an exported signature (packages/contracts/src/rpg/extraction.ts:577) |
| `packages/contracts/src/rpg/extraction.ts#RpgPopulateSheet` (types) | type used in an exported signature (packages/contracts/src/rpg/extraction.ts:726) |
| `packages/contracts/src/rpg/index.ts#ExtractionPlanePrompt` (types) | type used in an exported signature (packages/contracts/src/rpg/extraction-prompt.ts:129) |
| `packages/contracts/src/rpg/index.ts#ExtractionPromptContext` (types) | type used in an exported signature (packages/contracts/src/rpg/extraction-prompt.ts:84) |
| `packages/contracts/src/rpg/index.ts#RollDiceArgs` (types) | @public TSDoc |
| `packages/contracts/src/rpg/index.ts#RpgBusEventType` (types) | derived union of an as const tuple |
| `packages/contracts/src/rpg/index.ts#RpgCheckpointTrigger` (types) | derived union of an as const tuple; type used in an exported signature (packages/contracts/src/rpg/enums.ts:44); @public TSDoc |
| `packages/contracts/src/rpg/index.ts#RpgCheckpointView` (types) | @public TSDoc |
| `packages/contracts/src/rpg/index.ts#RpgCreateCheckpointInput` (types) | @public TSDoc |
| `packages/contracts/src/rpg/index.ts#RpgCreateGameInput` (types) | @public TSDoc |
| `packages/contracts/src/rpg/index.ts#RpgDeleteJournalEntryInput` (types) | @public TSDoc |
| `packages/contracts/src/rpg/index.ts#RpgDeleteQuestInput` (types) | @public TSDoc |
| `packages/contracts/src/rpg/index.ts#RpgDismissActorInput` (types) | @public TSDoc |
| `packages/contracts/src/rpg/index.ts#RpgEditJournalEntryInput` (types) | @public TSDoc |
| `packages/contracts/src/rpg/index.ts#RpgEditQuestObjectiveInput` (types) | @public TSDoc |
| `packages/contracts/src/rpg/index.ts#RpgEditSnapshotInput` (types) | @public TSDoc |
| `packages/contracts/src/rpg/index.ts#RpgExtractionDrop` (types) | type used in an exported signature (packages/contracts/src/rpg/extraction.ts:591) |
| `packages/contracts/src/rpg/index.ts#RpgExtractionDropPlane` (types) | type used in an exported signature (packages/contracts/src/rpg/extraction.ts:577) |
| `packages/contracts/src/rpg/index.ts#RpgExtractionSalvage` (types) | type used in an exported signature (packages/contracts/src/rpg/extraction.ts:646) |
| `packages/contracts/src/rpg/index.ts#RpgGameMode` (types) | derived union of an as const tuple; type used in an exported signature (packages/contracts/src/rpg/enums.ts:15) |
| `packages/contracts/src/rpg/index.ts#RpgGameStatus` (types) | derived union of an as const tuple; type used in an exported signature (packages/contracts/src/rpg/enums.ts:21) |
| `packages/contracts/src/rpg/index.ts#RpgListJournalInput` (types) | @public TSDoc |
| `packages/contracts/src/rpg/index.ts#RpgListTurnToolCallsInput` (types) | @public TSDoc |
| `packages/contracts/src/rpg/index.ts#RpgMalformedToolCall` (types) | type used in an exported signature (packages/contracts/src/rpg/extraction.ts:871) |
| `packages/contracts/src/rpg/index.ts#RpgModePolicy` (types) | type used in an exported signature (packages/contracts/src/rpg/mode.ts:51) |
| `packages/contracts/src/rpg/index.ts#RpgPatchActorInput` (types) | @public TSDoc |
| `packages/contracts/src/rpg/index.ts#RpgPatchSheetInput` (types) | @public TSDoc |
| `packages/contracts/src/rpg/index.ts#RpgPopulate` (types) | @public TSDoc |
| `packages/contracts/src/rpg/index.ts#RpgPopulateFromCharacterInput` (types) | @public TSDoc |
| `packages/contracts/src/rpg/index.ts#RpgPopulateSalvage` (types) | type used in an exported signature (packages/contracts/src/rpg/extraction.ts:743) |
| `packages/contracts/src/rpg/index.ts#RpgPopulateSheet` (types) | type used in an exported signature (packages/contracts/src/rpg/extraction.ts:726) |
| `packages/contracts/src/rpg/index.ts#RpgPromoteActorInput` (types) | @public TSDoc |
| `packages/contracts/src/rpg/index.ts#RpgReadGameInput` (types) | @public TSDoc |
| `packages/contracts/src/rpg/index.ts#RpgRestoreCheckpointInput` (types) | @public TSDoc |
| `packages/contracts/src/rpg/index.ts#RpgRollDiceInput` (types) | @public TSDoc |
| `packages/contracts/src/rpg/index.ts#RpgRulesetVocabulary` (types) | type used in an exported signature (packages/contracts/src/rpg/ruleset.ts:88) |
| `packages/contracts/src/rpg/index.ts#RpgToolName` (types) | imported by a rebuilt test or the testkit; derived union of an as const tuple; type used in an exported signature (packages/contracts/src/rpg/tools.ts:46) |
| `packages/contracts/src/rpg/index.ts#RpgTrackerCarrierKind` (types) | type used in an exported signature (packages/contracts/src/rpg/tracker.ts:149) |
| `packages/contracts/src/rpg/index.ts#RpgTrackerSubject` (types) | derived union of an as const tuple; type used in an exported signature (packages/contracts/src/rpg/enums.ts:70) |
| `packages/contracts/src/rpg/index.ts#RpgTrackerWrite` (types) | derived union of an as const tuple; type used in an exported signature (packages/contracts/src/rpg/enums.ts:64) |
| `packages/contracts/src/rpg/index.ts#RpgTrackerWriteGroup` (types) | type used in an exported signature (packages/contracts/src/rpg/tracker.ts:223) |
| `packages/contracts/src/rpg/index.ts#RpgUpdateConfigInput` (types) | @public TSDoc |
| `packages/contracts/src/rpg/index.ts#RpgUpsertQuestInput` (types) | @public TSDoc |
| `packages/contracts/src/rpg/index.ts#RpgWeatherType` (types) | type used in an exported signature (packages/contracts/src/rpg/ambient.ts:50); @public TSDoc |
| `packages/contracts/src/rpg/index.ts#TimeOfDay` (types) | derived union of an as const tuple; type used in an exported signature (packages/contracts/src/rpg/ambient.ts:103) |
| `packages/contracts/src/rpg/mode.ts#RpgModePolicy` (types) | type used in an exported signature (packages/contracts/src/rpg/mode.ts:51) |
| `packages/contracts/src/rpg/tracker.ts#RpgTrackerCarrierKind` (types) | type used in an exported signature (packages/contracts/src/rpg/tracker.ts:149) |
| `packages/contracts/src/search/index.ts#DiscoverCharacter` (types) | type used in an exported signature (packages/contracts/src/search/index.ts:230); name read by tooling, scripts or root config (tooling/src/verify/gates/contract-structural-copy.ts:182) |
| `packages/contracts/src/theme/index.ts#CardEmbeddableThemeKey` (types) | type used in an exported signature (packages/contracts/src/theme/override.ts:127) |
| `packages/contracts/src/theme/index.ts#MaterializedBackgroundAsset` (types) | type used in an exported signature (packages/contracts/src/theme/materialize.ts:27) |
| `packages/contracts/src/theme/index.ts#ThemeKeyReach` (types) | derived union of an as const tuple |
| `packages/contracts/src/theme/index.ts#ViewerSacredThemeKey` (types) | type used in an exported signature (packages/contracts/src/theme/override.ts:131) |
| `packages/contracts/src/theme/materialize.ts#MaterializedBackgroundAsset` (types) | type used in an exported signature (packages/contracts/src/theme/materialize.ts:27) |
| `packages/contracts/src/theme/override.ts#CardEmbeddableThemeKey` (types) | type used in an exported signature (packages/contracts/src/theme/override.ts:127) |
| `packages/contracts/src/theme/override.ts#ThemeKeyReach` (types) | derived union of an as const tuple |
| `packages/contracts/src/theme/override.ts#ViewerSacredThemeKey` (types) | type used in an exported signature (packages/contracts/src/theme/override.ts:131) |
| `packages/contracts/src/workloads/index.ts#NoWorkloadParams` (types) | type used in an exported signature (packages/contracts/src/workloads/params.ts:107) |
| `packages/contracts/src/workloads/index.ts#StartWorkloadEnvelope` (types) | type used in an exported signature (packages/contracts/src/workloads/params.ts:150) |
| `packages/contracts/src/workloads/index.ts#WorkloadModePolicy` (types) | type used in an exported signature (packages/contracts/src/workloads/axes.ts:106) |
| `packages/contracts/src/workloads/index.ts#WorkloadScheduleView` (types) | @public TSDoc |
| `packages/contracts/src/workloads/params.ts#NoWorkloadParams` (types) | type used in an exported signature (packages/contracts/src/workloads/params.ts:107) |
