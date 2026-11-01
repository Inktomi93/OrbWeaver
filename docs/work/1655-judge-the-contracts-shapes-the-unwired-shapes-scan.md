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

72 rows: applied 3, kept 61 (42 deliberate, 19 with a reason), owner question 2, left as Plugin API 6, handed off 0. Scan: ast-grep inline rule (identifier, type_identifier, property_identifier), `-l ts` and `-l tsx`, `packages tests` (5200 ts and 1450 tsx files), plus `rg -w` per name for the renamed ones.

Applied (3):

- `ImageDuplicatePair` / `ArtPair`: `ArtPair` was a private structural copy of the wire pair in `client/src/features/discovery/lib/corpus-duplicate-groups.ts`. It is deleted; `groupIdenticalArt` bounds on `ImageDuplicatePair` from `@orb/contracts/discovery`. One concept: the pair the discovery query returns.
- `BlockKey` / `RecallBlockKey`: one concept, the memory block identity, and the contract may import kit. `kit/src/recall/index.ts` now names it `BlockKey` (with the contract's field doc), and `contracts/src/search/index.ts` imports it for its own schemas without re-exporting it. The 5 other importers (`contracts/src/chat/owner-ops.ts` and four server files) import `BlockKey` from `@orb/kit/recall`, moved with `move-import-names` (dry run listed exactly those 5). The kit name `RecallBlockKey` and its test import are renamed. The contract's mutable fields became readonly; typecheck over kit, contracts, server, client and the three test worlds passes.
- `Theme` / `ThemeView`: `ThemeView` was the same theme entity view (`themeViewSchema` is the strict wire schema for it). `ThemeView` is deleted; `themeViewSchema` now `satisfies z.ZodType<Theme>`; the 8 server settings files import `Theme` from `@orb/contracts/theme`, moved with `move-import-names` (dry run listed exactly the 8 files, equal to `rg -w ThemeView`). `contracts/settings` already imports down from `contracts/theme`. A test comment is updated.

Owner questions (2):

- `ConnectedCharacterView` / `ArtCliqueMember` (the item says import `ConnectedCharacterView`): not applied. The contract documents that type as the persona-side read of the character and persona junction, "deliberately a summary" for that relation list. `ArtCliqueMember` is a client grouping type for duplicate-art cliques, pinned by `tests/client/features/discovery/lib/corpus-duplicate-groups.test-d.ts`. Importing the persona type into the discovery feature couples it to the persona relation. Question: confirm the import, or name a neutral character chip.
- `ThemeOverride` / `ThemeScopeTokens` (the item says home it in `@orb/kit`): not applied. The two zod schemas differ in their colour validators (`isRenderableColor` in contracts, `isSafeColor` in ui), so one kit schema changes what a theme token accepts. That is a security-adjacent behaviour change. `tests/contracts/theme/pairing.dom.test-d.ts` already pins the two types equal. Question: which validator wins, or keep the pairing test as the guard.

Kept with a reason (19):

- `OwnedAssetBytes` / `SeedAssetBytes`: `default-content` depends on kit only. One is an owned asset's stored bytes, the other a shipped seed file's bytes; sharing needs a new kit blob type or a package edge.
- `SeededPlateAsset` / `MaterializedBackgroundAsset` (2 rows, one pair): each is the result of its own op (`StoreSeedPlate`, `MaterializeBackgroundOp`) with its own producer and consumers; they match in three fields now and change with their op.
- `CardDepthPrompt` / `AssembleDepthNote`: `contracts/src/chat/assemble.ts` re-homes the note slim so `chat` avoids a `chat` to `character` edge (its header says so); `docs/law/Core-0-Architecture-and-Structure.md` section 4 forbids sideways cross-feature imports.
- `GeneratedGreeting` / `ExtractQuietResult`, `GeneratedGreeting` / `QuietGenerateResult` (2 rows): the first is the greeting verbs' wire result; the other two are server-side injected op results that also carry `costUsd`. A contract may not import server types.
- `TurnOrigin` / `TurnOriginRead`: stale. `TurnOriginRead` does not exist (0 hits ts and tsx, and rg), and `contracts/src/automation/index.ts` already imports `TurnOrigin` from `../chat/bus.ts`.
- `StandaloneVariableDelta` / `DeltaEntry`: `DeltaEntry` is the private substrate fold input for per-message and standalone deltas alike; the contract type is the standalone wire shape.
- `ChatSeatPortrait` / `ArchetypeMember`, `ChatSeatPortrait` / `CardDisplayRow`, `ArchetypeMember` / `CardDisplayRow` (3 rows): two are wire views of different domains (chat seat, discovery archetype); `CardDisplayRow` is a server persistence row, the contract-versus-row seam. Merging would make the DB read change with the wire.
- `DocumentCharacterRef` / `ConnectedCharacterView`, `DocumentCharacterRef` / `ArtCliqueMember` (2 rows): different relations in different domains (databank attachment, persona junction); the second follows the `ArtCliqueMember` owner question above.
- `ViewerView` / `SessionMeResult`: `SessionMeResult` is derived from the router procedure's return type (`client/src/dev/agent-seed/client.ts`); it is not a copy.
- `JoinerPersona` / `BookDetailsPatch`: `{ name, description }` shared by chance; a join form and a world-book dialog.
- `ForgeTranspileDrop` / `SkippedTreeFile`: `{ path, reason }` shared by chance; a schema transpile drop and a skipped import file.
- `CharacterCardHit` / `DossierNeighbor`: `contracts/src/discovery/index.ts` says "Deliberately NOT search's `CharacterCardHit`"; discovery owns its narrowed neighbour view and does not import search types.
- `MemoryDefaults` / `MemoryConfig`: `server/src/domain/chat/contract/memory.ts` re-spells the knobs on purpose so the subsystem owns exactly what it consumes; one is the admin wire shape, the other the subsystem's tuning input.
- `VersionedParseIssue` / `BeltIssue`: `{ path, message }` shared by chance; a versioned-config parse issue and a schema-authoring belt issue.

Kept as deliberate (42): every row whose both sides are a verb's `...Params` or `...Result` (automation, character, chat, and the other domains in the table): `docs/law/Core-0-Architecture-and-Structure.md` section 4 (`params.ts` and `results.ts`, "every verb's \*Params", "every verb's \*Result"). I checked each row's two names against that pattern; none is outside it.

Left as Plugin API (6, hard limit `packages/contracts/src/plugin/`): `PluginSelectOption` against `ConfigSettingOption`, `ParamToggleOption`, `ToggleItem` and `UserMacroInputOption`; `PluginBoundKeyValueRow` / `GlobalVarWrite`; `PluginDisplayTransformView` / `PluginLogPanelProps`. No guest-reach proof was attempted, so none was changed.

Commands: `pnpm typecheck packages/kit/tsconfig.json packages/contracts/tsconfig.json packages/server/tsconfig.json packages/client/tsconfig.json tsconfig.tests-dom.json tsconfig.tests-iso.json tsconfig.node.json` exit 0; `pnpm test tests/kit/recall/format-and-window.test.ts tests/client/features/discovery/lib/corpus-duplicate-groups.test.ts` exit 0 (8 passed); `pnpm lint:eslint` on the touched paths exit 0; `pnpm depcruise` exit 0.
