---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the contracts fields the unwired fields scan reports: assets, automation, card-face, character

## What

`pnpm unwired fields` reports each of the fields below in `contracts`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `StoredAsset.size` | `contracts/src/assets/index.ts:74` | never-read | delete | delete the field and its writes (`server/src/domain/assets/persistence/queries.ts:172`) |
| `AssetListItem.kind` | `contracts/src/assets/index.ts:120` | unreferenced | delete | delete the field and the 1 test reference |
| `AssetListItem.size` | `contracts/src/assets/index.ts:122` | unreferenced | delete | delete the field and the 1 test reference |
| `listOwnedParamsSchema.kind` | `contracts/src/assets/index.ts:148` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/assets/verbs/list-owned.ts:12` |
| `listOwnedParamsSchema.cursor` | `contracts/src/assets/index.ts:151` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/assets/verbs/list-owned.ts:12` |
| `galleryListParamsSchema.cursor` | `contracts/src/assets/index.ts:185` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/assets/verbs/list-gallery.ts:12` |
| `GalleryItemView.assetId` | `contracts/src/assets/index.ts:194` | unreferenced | delete | delete the field and the 1 test reference |
| `GalleryItemView.mime` | `contracts/src/assets/index.ts:196` | unreferenced | delete | delete the field |
| `GalleryItemView.subjectCharacterId` | `contracts/src/assets/index.ts:198` | unreferenced | delete | delete the field and the 5 test references |
| `GlobalVariableView.updatedAt` | `contracts/src/automation/index.ts:165` | never-read | delete | delete the field and its writes (`server/src/domain/automation/persistence/queries.ts:18`) |
| `automationActionSchema.position` | `contracts/src/automation/index.ts:526` | never-read | delete | delete the key and its writes (`server/src/domain/automation/contract/presets.ts:434`) and the 1 test reference |
| `automationActionSchema.speakerCharacterId` | `contracts/src/automation/index.ts:559` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/automation/engine/arm-executors.ts:365` |
| `automationActionSchema.argsTemplate` | `contracts/src/automation/index.ts:643` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/automation/engine/arm-executors.ts:480` |
| `automationActionSchema.resultVar` | `contracts/src/automation/index.ts:649` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/automation/engine/arm-executors.ts:493` |
| `triggerFactPayloadSchema.message.id` | `contracts/src/automation/index.ts:719` | unreferenced | delete | delete the key |
| `triggerFactPayloadSchema.message.role` | `contracts/src/automation/index.ts:720` | unreferenced | delete | delete the key |
| `triggerFactPayloadSchema.message.characterId` | `contracts/src/automation/index.ts:724` | unreferenced | delete | delete the key |
| `triggerFactPayloadSchema.turn.intent` | `contracts/src/automation/index.ts:732` | never-read | delete | delete the key and its writes (`server/src/domain/automation/substrate/fact-resolver.ts:140`) |
| `triggerFactPayloadSchema.turn.api` | `contracts/src/automation/index.ts:733` | never-read | delete | delete the key and its writes (`server/src/domain/automation/substrate/fact-resolver.ts:140`) |
| `triggerFactPayloadSchema.turn.provider` | `contracts/src/automation/index.ts:735` | never-read | delete | delete the key and its writes (`server/src/domain/automation/substrate/fact-resolver.ts:140`) |
| `triggerFactPayloadSchema.turn.model` | `contracts/src/automation/index.ts:736` | never-read | delete | delete the key and its writes (`server/src/domain/automation/substrate/fact-resolver.ts:140`) |
| `triggerFactPayloadSchema.turn.speakerCharacterId` | `contracts/src/automation/index.ts:738` | never-read | delete | delete the key and its writes (`server/src/domain/automation/substrate/fact-resolver.ts:140`) |
| `triggerFactPayloadSchema.turn.abortReason` | `contracts/src/automation/index.ts:739` | unreferenced | delete | delete the key |
| `triggerFactPayloadSchema.turn.automationDepth` | `contracts/src/automation/index.ts:740` | never-read | delete | delete the key and its writes (`server/src/domain/automation/substrate/fact-resolver.ts:140`) |
| `triggerFactPayloadSchema.worldInfo.entryIds` | `contracts/src/automation/index.ts:744` | never-read | delete | delete the key and its writes (`server/src/domain/automation/substrate/fact-resolver.ts:163`) |
| `triggerFactPayloadSchema.reaction.variantId` | `contracts/src/automation/index.ts:758` | unreferenced | delete | delete the key |
| `triggerFactPayloadSchema.reaction.emoji` | `contracts/src/automation/index.ts:759` | unreferenced | delete | delete the key |
| `triggerFactPayloadSchema.reaction.added` | `contracts/src/automation/index.ts:760` | unreferenced | delete | delete the key |
| `triggerFactPayloadSchema.persona.from` | `contracts/src/automation/index.ts:765` | never-read | delete | delete the key and its writes (`server/src/domain/automation/substrate/fact-resolver.ts:166`) |
| `triggerFactPayloadSchema.persona.to` | `contracts/src/automation/index.ts:765` | never-read | delete | delete the key and its writes (`server/src/domain/automation/substrate/fact-resolver.ts:166`) |
| `triggerFactPayloadSchema.character.contentChanged` | `contracts/src/automation/index.ts:778` | never-read | delete | delete the key and its writes (`server/src/domain/automation/substrate/fact-resolver.ts:181`) |
| `AutomationCelEnv.chat.id` | `contracts/src/automation/index.ts:807` | never-read | delete | delete the field and its writes (`server/src/domain/automation/substrate/cel-env.ts:49`) |
| `AutomationCelEnv.chat.messageCount` | `contracts/src/automation/index.ts:807` | never-read | delete | delete the field and its writes (`server/src/domain/automation/substrate/cel-env.ts:49`) |
| `AutomationCelEnv.now.hour` | `contracts/src/automation/index.ts:810` | never-read | delete | delete the field and its writes (`server/src/domain/automation/substrate/dry-run.ts:27`) |
| `AutomationCelEnv.now.dayOfWeek` | `contracts/src/automation/index.ts:810` | never-read | delete | delete the field and its writes (`server/src/domain/automation/substrate/dry-run.ts:27`) |
| `RewriteCardDetail.kind` | `contracts/src/automation/index.ts:910` | never-read | delete | delete the field and its writes (`server/src/domain/automation/engine/analysis-arm.ts:363`) |
| `TurnOriginRead.initiator` | `contracts/src/automation/index.ts:1123` | unreferenced | delete | delete the field |
| `RuleView.chatId` | `contracts/src/automation/index.ts:1185` | never-read | delete | delete the field and its writes (`server/src/domain/automation/persistence/rules.ts:54`) and the 4 test references |
| `RuleView.updatedAt` | `contracts/src/automation/index.ts:1223` | never-read | delete | delete the field and its writes (`server/src/domain/automation/persistence/rules.ts:72`) and the 2 test references |
| `FireView.ruleId` | `contracts/src/automation/index.ts:1271` | never-read | delete | delete the field and its writes (`server/src/domain/automation/persistence/fires.ts:49`) and the 2 test references |
| `FireView.chatId` | `contracts/src/automation/index.ts:1272` | never-read | delete | delete the field and its writes (`server/src/domain/automation/persistence/fires.ts:50`) and the 4 test references |
| `ConfirmSuggestionResult.ran` | `contracts/src/automation/index.ts:1307` | never-read | delete | delete the field and its writes (`server/src/domain/automation/verbs/confirm-suggestion.ts:336`) |
| `ConfirmSuggestionResult.outcome` | `contracts/src/automation/index.ts:1308` | never-read | delete | delete the field and its writes (`server/src/domain/automation/verbs/confirm-suggestion.ts:336`) |
| `RulePresetKnobDescriptors.number` | `contracts/src/automation/presets.ts:217` | unreferenced | delete | delete the field |
| `RulePresetKnobDescriptors.text` | `contracts/src/automation/presets.ts:218` | unreferenced | delete | delete the field |
| `RulePresetKnobDescriptors.textList` | `contracts/src/automation/presets.ts:219` | unreferenced | delete | delete the field |
| `RulePresetKnobDescriptors.choice` | `contracts/src/automation/presets.ts:220` | unreferenced | delete | delete the field |
| `RulePresetKnobDescriptors.entityRef` | `contracts/src/automation/presets.ts:221` | unreferenced | delete | delete the field |
| `ResolvedCardFace.name` | `contracts/src/card-face/index.ts:53` | unreferenced | delete | delete the field |
| `ResolvedCardFace.description` | `contracts/src/card-face/index.ts:54` | unreferenced | delete | delete the field |
| `ResolvedCardFace.starred` | `contracts/src/card-face/index.ts:55` | unreferenced | delete | delete the field |
| `cardAssetSchema.type` | `contracts/src/character/index.ts:154` | unreferenced | delete | delete the key |
| `cardAssetSchema.uri` | `contracts/src/character/index.ts:155` | unreferenced | delete | delete the key |
| `cardAssetSchema.name` | `contracts/src/character/index.ts:156` | unreferenced | delete | delete the key |
| `cardAssetSchema.ext` | `contracts/src/character/index.ts:157` | unreferenced | delete | delete the key |
| `createCharacterSchema.starred` | `contracts/src/character/index.ts:403` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/character/verbs/create.ts:119` |
| `characterBookEntrySchema.keys` | `contracts/src/character/index.ts:584` | unreferenced | delete | delete the key |
| `characterBookEntrySchema.content` | `contracts/src/character/index.ts:585` | unreferenced | delete | delete the key |
| `characterBookEntrySchema.enabled` | `contracts/src/character/index.ts:586` | unreferenced | delete | delete the key |
| `characterBookEntrySchema.insertion_order` | `contracts/src/character/index.ts:587` | unreferenced | delete | delete the key |
| `characterBookEntrySchema.comment` | `contracts/src/character/index.ts:588` | unreferenced | delete | delete the key |
| `characterBookEntrySchema.constant` | `contracts/src/character/index.ts:589` | unreferenced | delete | delete the key |
| `characterBookEntrySchema.extensions` | `contracts/src/character/index.ts:590` | unreferenced | delete | delete the key |
| `characterBookEntrySchema.use_regex` | `contracts/src/character/index.ts:596` | unreferenced | delete | delete the key |
| `characterBookSchema.entries` | `contracts/src/character/index.ts:600` | unreferenced | delete | delete the key and the 2 test references |
| `characterCardV3DataSchema.name` | `contracts/src/character/index.ts:604` | unreferenced | delete | delete the key and the 3 test references |
| `characterCardV3DataSchema.description` | `contracts/src/character/index.ts:605` | unreferenced | delete | delete the key and the 4 test references |
| `characterCardV3DataSchema.personality` | `contracts/src/character/index.ts:606` | unreferenced | delete | delete the key and the 1 test reference |
| `characterCardV3DataSchema.scenario` | `contracts/src/character/index.ts:607` | unreferenced | delete | delete the key and the 1 test reference |
| `characterCardV3DataSchema.first_mes` | `contracts/src/character/index.ts:608` | unreferenced | delete | delete the key and the 2 test references |
| `characterCardV3DataSchema.mes_example` | `contracts/src/character/index.ts:609` | unreferenced | delete | delete the key and the 1 test reference |
| `characterCardV3DataSchema.system_prompt` | `contracts/src/character/index.ts:610` | unreferenced | delete | delete the key and the 1 test reference |
| `characterCardV3DataSchema.post_history_instructions` | `contracts/src/character/index.ts:611` | unreferenced | delete | delete the key and the 1 test reference |
| `characterCardV3DataSchema.creator` | `contracts/src/character/index.ts:612` | unreferenced | delete | delete the key and the 1 test reference |
| `characterCardV3DataSchema.creator_notes` | `contracts/src/character/index.ts:613` | unreferenced | delete | delete the key and the 1 test reference |
| `characterCardV3DataSchema.character_version` | `contracts/src/character/index.ts:614` | unreferenced | delete | delete the key and the 1 test reference |
| `characterCardV3DataSchema.alternate_greetings` | `contracts/src/character/index.ts:615` | unreferenced | delete | delete the key and the 2 test references |
| `characterCardV3DataSchema.tags` | `contracts/src/character/index.ts:616` | unreferenced | delete | delete the key and the 3 test references |
| `characterCardV3DataSchema.extensions` | `contracts/src/character/index.ts:617` | unreferenced | delete | delete the key and the 9 test references |
| `characterCardV3DataSchema.character_book` | `contracts/src/character/index.ts:618` | unreferenced | delete | delete the key and the 5 test references |
| `characterCardV3DataSchema.assets` | `contracts/src/character/index.ts:624` | unreferenced | delete | delete the key and the 2 test references |
| `characterCardV3DataSchema.nickname` | `contracts/src/character/index.ts:626` | unreferenced | delete | delete the key and the 1 test reference |
| `characterCardV3DataSchema.creator_notes_multilingual` | `contracts/src/character/index.ts:628` | unreferenced | delete | delete the key and the 2 test references |
| `characterCardV3DataSchema.source` | `contracts/src/character/index.ts:630` | unreferenced | delete | delete the key and the 1 test reference |
| `characterCardV3DataSchema.group_only_greetings` | `contracts/src/character/index.ts:632` | unreferenced | delete | delete the key and the 3 test references |
| `characterCardV3DataSchema.creation_date` | `contracts/src/character/index.ts:634` | unreferenced | delete | delete the key and the 1 test reference |
| `characterCardV3DataSchema.modification_date` | `contracts/src/character/index.ts:635` | unreferenced | delete | delete the key and the 1 test reference |
| `characterCardV3DataSchema.orbweaver_attached_books` | `contracts/src/character/index.ts:638` | unreferenced | delete | delete the key and the 1 test reference |
| `characterBulkTagFailureSchema.id` | `contracts/src/character/index.ts:700` | never-read | delete | delete the key and its writes (`server/src/domain/character/substrate/bulk-tag-result.ts:37`) |
| `characterBulkTagFailureSchema.error.code` | `contracts/src/character/index.ts:702` | never-read | delete | delete the key and its writes (`server/src/domain/character/substrate/bulk-tag-result.ts:25`) |
| `CharacterDetail.archived` | `contracts/src/character/index.ts:728` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `CharacterDetail.synthetic` | `contracts/src/character/index.ts:729` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `CharacterDetail.forbidExternalMedia` | `contracts/src/character/index.ts:731` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `CharacterDetail.trustHtml` | `contracts/src/character/index.ts:733` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `CharacterDetail.interactiveHtml` | `contracts/src/character/index.ts:739` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `CharacterDetail.importedFrom` | `contracts/src/character/index.ts:744` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `CharacterDetail.importHash` | `contracts/src/character/index.ts:745` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `CharacterDetail.provenance` | `contracts/src/character/index.ts:750` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `CharacterDetail.contentHash` | `contracts/src/character/index.ts:751` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `CharacterDetail.createdAt` | `contracts/src/character/index.ts:752` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `CharacterSummaryFields.forbidExternalMedia` | `contracts/src/character/index.ts:765` | unreferenced | delete | delete the field |
| `CharacterSummaryFields.trustHtml` | `contracts/src/character/index.ts:766` | unreferenced | delete | delete the field |
| `CharacterSummaryFields.themeOverride` | `contracts/src/character/index.ts:767` | unreferenced | delete | delete the field |
| `CharacterSummaryFields.backgroundOverride` | `contracts/src/character/index.ts:769` | unreferenced | delete | delete the field |
| `CharacterSummaryFields.avatarAssetId` | `contracts/src/character/index.ts:770` | unreferenced | delete | delete the field |
| `CharacterSummaryFields.createdAt` | `contracts/src/character/index.ts:772` | unreferenced | delete | delete the field |
| `CharacterSummaryFields.chatCount` | `contracts/src/character/index.ts:792` | unreferenced | delete | delete the field |
| `CharacterSummaryFields.provenance` | `contracts/src/character/index.ts:795` | unreferenced | delete | delete the field |
| `GeneratedGreeting.costUsd` | `contracts/src/character/index.ts:844` | never-read | delete | delete the field and its writes (`server/src/domain/character/verbs/greeting-ops.ts:32`) |
| `SnapshotRef.characterId` | `contracts/src/character/index.ts:850` | never-read | delete | delete the field and its writes (`server/src/domain/character/verbs/snapshot.ts:44`) |
| `SnapshotRef.createdAt` | `contracts/src/character/index.ts:851` | never-read | delete | delete the field and its writes (`server/src/domain/character/verbs/snapshot.ts:44`) |
| `SnapshotView.content` | `contracts/src/character/index.ts:869` | never-read | delete | delete the field and its writes (`server/src/domain/character/verbs/get-snapshot.ts:32`) and the 9 test references |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

Ran on the first pass: `pnpm typecheck` on contracts, server, client, tsconfig.node.json and tsconfig.tests-dom.json (exit 0); three int suites on the gallery, seed-art and global-variable paths (3 files, 10 tests, exit 0).

Second pass (owner ruling: an unread tRPC output field carries no product intent, so it goes and the corpus is republished in the same commit): the corpus was republished with `pnpm exec node scripts/corpus-fixture.ts publish <dir>` and formatted with Biome. A compiler probe on the 18 character rows found real readers for most of them; those were restored.

All 112 rows resolved:

| Disposition | Rows | Symbols and reader |
| - | - | - |
| applied | 12 | `GalleryItemView.mime`, `GlobalVariableView.updatedAt`, `StoredAsset.size`, `GeneratedGreeting.costUsd`, `SnapshotRef.characterId` and `.createdAt`, `characterBulkTagFailureSchema.id` and `.error.code` (the code constants went with it), `CharacterSummaryFields.forbidExternalMedia`, `.trustHtml` and `.backgroundOverride`, `CharacterDetail.synthetic` |
| derived from owning type | 1 | `TurnOriginRead.initiator`: `getTurnOrigin` now returns `TurnOrigin` from `contracts/src/chat/bus.ts` |
| kept: card spec parsed and handed on whole | 36 | `characterCardV3DataSchema`, `characterBookSchema`, `characterBookEntrySchema`, `cardAssetSchema` keys; the card parse at `packages/contracts/src/character/index.ts:648` hands `data` on whole |
| kept: CEL surface | 21 | `triggerFactPayloadSchema` (17) and `AutomationCelEnv` (4); the whole env is handed to the evaluator at `packages/server/src/domain/automation/substrate/dry-run.ts:34` and `macro-render.ts:21` |
| kept: stored rule JSON | 4 | `automationActionSchema.position`, `speakerCharacterId`, `argsTemplate`, `resultVar` |
| kept: tRPC infinite-query cursor and filter | 3 | `listOwnedParamsSchema.kind`, `.cursor`, `galleryListParamsSchema.cursor`. The client's `getNextPageParam` writes both cursors (`packages/client/src/features/chat/hooks/use-character-gallery.ts:55`); `kind` is written by `tests/support/node/corpus-surface-outputs.ts:150` and `corpus-library-views.ts:572`, which build the corpus. No production client writer supplies `kind` |
| kept: K-indexed type | 5 | `RulePresetKnobDescriptors` is indexed by `RulePresetKnobKind` at `packages/contracts/src/automation/presets.ts:225` |
| kept: shared base of derived views | 3 | `ResolvedCardFace` (used by `character/index.ts` and `persona/schemas.ts`) |
| kept: named reader (character rows) | 13 | Summary: `themeOverride` (`packages/client/src/features/character/components/character-card.tsx:47`), `chatCount` (`character-library-welcome.tsx:246`), `createdAt` (`character-library-welcome.tsx:117`), `provenance` (`character-library-welcome.tsx:202`). Detail: `archived`, `forbidExternalMedia`, `trustHtml`, `interactiveHtml` (`character-hero-band.tsx:46`), `importedFrom` and `importHash` (`character-facet-inspector.tsx:82`), `provenance` (`character-overview-card.tsx:111`), `contentHash` (`packages/server/src/entry/compose/imagery.ts:79`), `createdAt` (`character-overview-card.tsx:109`) |
| kept: named writer (input) | 1 | `createCharacterSchema.starred`, written by the card import at `packages/server/src/domain/import/substrate/card.ts:272` |
| handed off: only test files read the field | 10 | `AssetListItem.kind`, `AssetListItem.size`, `GalleryItemView.assetId`, `GalleryItemView.subjectCharacterId`, `SnapshotView.content`, `RuleView.chatId` and `.updatedAt`, `FireView.ruleId` and `.chatId`, `CharacterSummaryFields.avatarAssetId` (`tests/client/features/chat/components/platform-art-controls.suite.ct.tsx:23`) |
| owner question | 3 | `ConfirmSuggestionResult.ran` and `.outcome` (deleting both leaves an empty result; needs a void-or-keep call), `SuggestionCardDetail.kind` (a bus event field, not a tRPC output, and the single-arm union seam is documented in the comment only) |
| total | 112 | |
