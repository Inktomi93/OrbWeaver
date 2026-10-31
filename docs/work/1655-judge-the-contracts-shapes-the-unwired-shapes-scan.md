---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the contracts shapes the unwired shapes scan reports

## What

`pnpm unwired shapes` reports each of the shapes below in `contracts`; `reports/unwired/shapes.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Shape | At | Kind | Class | Decision |
| - | - | - | - | - |
| `OwnedAssetBytes` / `SeedAssetBytes` | `contracts/src/assets/index.ts:306` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `default-content/src/contract/index.ts:23`; a shape that matches by coincidence stays |
| `SeededPlateAsset` / `MaterializedBackgroundAsset` | `contracts/src/assets/seed-plate.ts:7` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `contracts/src/theme/materialize.ts:14`; a shape that matches by coincidence stays |
| `DeleteRuleParams` / `RunRuleNowParams` | `contracts/src/automation/index.ts:1246` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ListRulesParams` / `ResolveStreamAuthorityParams` | `contracts/src/automation/index.ts:1251` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ListRulesParams` / `ListActiveForChatParams` | `contracts/src/automation/index.ts:1251` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ListRulesParams` / `ListForChatParams` | `contracts/src/automation/index.ts:1251` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ListRulesParams` / `ListRoomDisplayScriptsParams` | `contracts/src/automation/index.ts:1251` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ListRulesParams` / `ListCheckpointsParams` | `contracts/src/automation/index.ts:1251` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ListRulesParams` / `ReadGameParams` | `contracts/src/automation/index.ts:1251` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ListRulesParams` / `DetachDanglingPointerParams` | `contracts/src/automation/index.ts:1251` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ListRulesParams` / `ResyncFromStoryParams` | `contracts/src/automation/index.ts:1251` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `CardDepthPrompt` / `AssembleDepthNote` | `contracts/src/character/index.ts:166` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `contracts/src/chat/assemble.ts:37`; a shape that matches by coincidence stays |
| `GeneratedGreeting` / `ExtractQuietResult` | `contracts/src/character/index.ts:842` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `server/src/domain/chat/contract/context.ts:187`; a shape that matches by coincidence stays |
| `GeneratedGreeting` / `QuietGenerateResult` | `contracts/src/character/index.ts:842` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `server/src/domain/chat/contract/context.ts:226`; a shape that matches by coincidence stays |
| `GetCardParams` / `EmbedCharacterCardParams` | `contracts/src/character/index.ts:1065` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `GetCardParams` / `RemoveCharacterParams` | `contracts/src/character/index.ts:1065` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `GetCardParams` / `ListSnapshotsParams` | `contracts/src/character/index.ts:1065` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `GetCardParams` / `ListConnectedParams` | `contracts/src/character/index.ts:1065` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `GetCardParams` / `ListForCharacterParams` | `contracts/src/character/index.ts:1065` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `GetCardParams` / `ListForCharacterParams` | `contracts/src/character/index.ts:1065` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `GetCharacterParams` / `EmbedCharacterCardParams` | `contracts/src/character/index.ts:1096` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `GetCharacterParams` / `RemoveCharacterParams` | `contracts/src/character/index.ts:1096` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `GetCharacterParams` / `ListSnapshotsParams` | `contracts/src/character/index.ts:1096` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `GetCharacterParams` / `ListConnectedParams` | `contracts/src/character/index.ts:1096` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `GetCharacterParams` / `ListForCharacterParams` | `contracts/src/character/index.ts:1096` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `GetCharacterParams` / `ListForCharacterParams` | `contracts/src/character/index.ts:1096` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `DuplicateCharacterParams` / `EmbedCharacterCardParams` | `contracts/src/character/index.ts:1123` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `DuplicateCharacterParams` / `RemoveCharacterParams` | `contracts/src/character/index.ts:1123` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `DuplicateCharacterParams` / `ListSnapshotsParams` | `contracts/src/character/index.ts:1123` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `DuplicateCharacterParams` / `ListConnectedParams` | `contracts/src/character/index.ts:1123` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `DuplicateCharacterParams` / `ListForCharacterParams` | `contracts/src/character/index.ts:1123` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `DuplicateCharacterParams` / `ListForCharacterParams` | `contracts/src/character/index.ts:1123` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `TurnOrigin` / `TurnOriginRead` | `contracts/src/chat/bus.ts:331` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `contracts/src/automation/index.ts:1122`; a shape that matches by coincidence stays |
| `StandaloneVariableDelta` / `DeltaEntry` | `contracts/src/chat/messages.ts:370` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `server/src/domain/chat/substrate/runtime-variables.ts:27`; a shape that matches by coincidence stays |
| `ChatScopedParams` / `ListRulesParams` | `contracts/src/chat/owner-ops.ts:181` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ChatScopedParams` / `ResolveStreamAuthorityParams` | `contracts/src/chat/owner-ops.ts:181` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ChatScopedParams` / `ListActiveForChatParams` | `contracts/src/chat/owner-ops.ts:181` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ChatScopedParams` / `ListForChatParams` | `contracts/src/chat/owner-ops.ts:181` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ChatScopedParams` / `ListRoomDisplayScriptsParams` | `contracts/src/chat/owner-ops.ts:181` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ChatScopedParams` / `ListCheckpointsParams` | `contracts/src/chat/owner-ops.ts:181` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ChatScopedParams` / `ReadGameParams` | `contracts/src/chat/owner-ops.ts:181` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ChatScopedParams` / `DetachDanglingPointerParams` | `contracts/src/chat/owner-ops.ts:181` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ChatScopedParams` / `ResyncFromStoryParams` | `contracts/src/chat/owner-ops.ts:181` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `AddCharacterToChatParams` / `RemoveCharacterFromChatParams` | `contracts/src/chat/seat-ops.ts:21` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ChatSeatPortrait` / `ArchetypeMember` | `contracts/src/chat/views.ts:27` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `contracts/src/discovery/artifacts.ts:24`; a shape that matches by coincidence stays |
| `ChatSeatPortrait` / `CardDisplayRow` | `contracts/src/chat/views.ts:27` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `server/src/domain/discovery/persistence/card-reads.ts:35`; a shape that matches by coincidence stays |
| `DocumentCharacterRef` / `ConnectedCharacterView` | `contracts/src/databank/index.ts:319` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `contracts/src/persona/schemas.ts:138`; a shape that matches by coincidence stays |
| `DocumentCharacterRef` / `ArtCliqueMember` | `contracts/src/databank/index.ts:319` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/features/discovery/lib/corpus-duplicate-groups.ts:17`; a shape that matches by coincidence stays |
| `ArchetypeMember` / `CardDisplayRow` | `contracts/src/discovery/artifacts.ts:24` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `server/src/domain/discovery/persistence/card-reads.ts:35`; a shape that matches by coincidence stays |
| `ImageDuplicatePair` / `ArtPair` | `contracts/src/discovery/index.ts:507` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/features/discovery/lib/corpus-duplicate-groups.ts:8`; a shape that matches by coincidence stays |
| `ViewerView` / `SessionMeResult` | `contracts/src/identity/index.ts:367` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/dev/agent-seed/client.ts:5`; a shape that matches by coincidence stays |
| `ExportPersonaParams` / `GetPersonaParams` | `contracts/src/persona/owner-ops.ts:29` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ExportPersonaParams` / `RemovePersonaParams` | `contracts/src/persona/owner-ops.ts:29` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ExportPersonaParams` / `ListConnectedCharactersParams` | `contracts/src/persona/owner-ops.ts:29` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ExportPersonaParams` / `DuplicatePersonaParams` | `contracts/src/persona/owner-ops.ts:29` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ExportPersonaParams` / `ListForPersonaParams` | `contracts/src/persona/owner-ops.ts:29` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `JoinerPersona` / `BookDetailsPatch` | `contracts/src/persona/schemas.ts:88` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/features/world-info/components/book-details-dialog.tsx:18`; a shape that matches by coincidence stays |
| `ConnectedCharacterView` / `ArtCliqueMember` | `contracts/src/persona/schemas.ts:138` | restated | delete (read) | the client restates a character chip the contract already names: import `ConnectedCharacterView` |
| `ForgeTranspileDrop` / `SkippedTreeFile` | `contracts/src/refinery/schema-forge.ts:254` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/data/import-tree-plan.ts:38`; a shape that matches by coincidence stays |
| `BlockKey` / `RecallBlockKey` | `contracts/src/search/index.ts:36` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `kit/src/recall/index.ts:8`; a shape that matches by coincidence stays |
| `CharacterCardHit` / `DossierNeighbor` | `contracts/src/search/index.ts:162` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `contracts/src/discovery/index.ts:459`; a shape that matches by coincidence stays |
| `MemoryDefaults` / `MemoryConfig` | `contracts/src/settings/index.ts:120` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `server/src/domain/chat/contract/memory.ts:36`; a shape that matches by coincidence stays |
| `Theme` / `ThemeView` | `contracts/src/theme/index.ts:61` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `contracts/src/settings/index.ts:944`; a shape that matches by coincidence stays |
| `MaterializedBackgroundAsset` / `SeededPlateAsset` | `contracts/src/theme/materialize.ts:14` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `contracts/src/assets/seed-plate.ts:7`; a shape that matches by coincidence stays |
| `ThemeOverride` / `ThemeScopeTokens` | `contracts/src/theme/override.ts:78` | restated | wire (read) | one token-override concept in contracts and ui, and ui cannot import contracts: home it in `@orb/kit`, which both import |
| `VersionedParseIssue` / `BeltIssue` | `contracts/src/versioned-config/index.ts:83` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `contracts/src/refinery/schema-authoring.ts:96`; a shape that matches by coincidence stays |

### Plugin API: keep unless no guest can reach it

Plugin guests use the published plugin surface from outside the tree, so the scan cannot see their reads, writes and calls. Delete a row only after proving no guest reaches it through the host ABI or the plugin SDK.

| Shape | At | Kind | Class | Decision |
| - | - | - | - | - |
| `PluginSelectOption` / `ConfigSettingOption` | `contracts/src/plugin/ui.ts:564` | restated | unknown | keep unless no guest can reach it; else judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/state/config-group-registry.ts:78`; a shape that matches by coincidence stays |
| `PluginSelectOption` / `ParamToggleOption` | `contracts/src/plugin/ui.ts:564` | restated | unknown | keep unless no guest can reach it; else judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/features/discovery/components/corpus-controls.tsx:44`; a shape that matches by coincidence stays |
| `PluginSelectOption` / `ToggleItem` | `contracts/src/plugin/ui.ts:564` | restated | unknown | keep unless no guest can reach it; else judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/features/preset/lib/assembly-model.ts:142`; a shape that matches by coincidence stays |
| `PluginSelectOption` / `UserMacroInputOption` | `contracts/src/plugin/ui.ts:564` | restated | unknown | keep unless no guest can reach it; else judge by concept: if both name one concept, keep one home and derive or import the other from `kit/src/macro/user-macros.ts:44`; a shape that matches by coincidence stays |
| `PluginBoundKeyValueRow` / `GlobalVarWrite` | `contracts/src/plugin/ui.ts:1328` | restated | unknown | keep unless no guest can reach it; else judge by concept: if both name one concept, keep one home and derive or import the other from `kit/src/macro/types.ts:241`; a shape that matches by coincidence stays |
| `PluginDisplayTransformView` / `PluginLogPanelProps` | `contracts/src/plugin/view.ts:88` | restated | unknown | keep unless no guest can reach it; else judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/features/plugin/components/plugin-log-panel.tsx:27`; a shape that matches by coincidence stays |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired shapes` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
