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

Ran: `pnpm typecheck` on contracts, server, client, tsconfig.node.json and tsconfig.tests-dom.json (exit 0); `pnpm test` on `tests/server/domain/character/persistence/gallery-character-ops.int.test.ts`, `tests/server/domain/assets/verbs/seed-art.int.test.ts` and `tests/server/domain/automation/persistence/plugin-frozen-grants.int.test.ts` (3 files, 10 tests, exit 0). Neither `GalleryItemView` nor `GlobalVariableView` appears in `tests/support/node/corpus-data/corpus.json` (no `galleryItemId`, `uploadedAt` key in it).

All 112 rows resolved:

| Disposition | Rows | Symbols and reader |
| - | - | - |
| applied | 2 | `GalleryItemView.mime`, `GlobalVariableView.updatedAt` (server-side projection, not on a router) |
| derived from owning type | 1 | `TurnOriginRead.initiator`: `getTurnOrigin` now returns `TurnOrigin` from `contracts/src/chat/bus.ts` |
| kept: card spec parsed and handed on whole | 36 | `characterCardV3DataSchema`, `characterBookSchema`, `characterBookEntrySchema`, `cardAssetSchema` keys; the card parse at `packages/contracts/src/character/index.ts:648` hands `data` on whole and a key dropped here strips imported card data |
| kept: CEL surface | 21 | `triggerFactPayloadSchema` (17) and `AutomationCelEnv` (4); the whole env is handed to the evaluator at `packages/server/src/domain/automation/substrate/dry-run.ts:34` and `macro-render.ts:21`, so a user expression may name any field |
| kept: stored rule JSON | 4 | `automationActionSchema.position`, `speakerCharacterId`, `argsTemplate`, `resultVar`; stored rows must keep reading |
| kept: tRPC infinite-query cursor and filter | 3 | `listOwnedParamsSchema.kind`, `.cursor`, `galleryListParamsSchema.cursor` (`packages/contracts/src/assets/index.ts:138`) |
| kept: K-indexed type | 5 | `RulePresetKnobDescriptors` is indexed by `RulePresetKnobKind` at `packages/contracts/src/automation/presets.ts:225` |
| kept: shared base of derived views | 3 | `ResolvedCardFace` (used by `character/index.ts` and `persona/schemas.ts`) |
| owner question: wire output, field present in the corpus | 18 | `CharacterSummaryFields` (8, `character.list` is in the corpus), `CharacterDetail` (10, whole value handed to the client) |
| handed off: only test files read the field | 9 | `AssetListItem.kind`, `AssetListItem.size`, `GalleryItemView.assetId`, `GalleryItemView.subjectCharacterId`, `SnapshotView.content` (`tests/support/node/factories/character-library.int.test.ts:88`), `RuleView.chatId`, `RuleView.updatedAt`, `FireView.ruleId`, `FireView.chatId` |
| owner question: wire output with no reader found, deletion is a wire change | 10 | `StoredAsset.size` (REST upload response, parsed by `tests/server/entry/http/body-limit-ordering.int.test.ts:193`), `SuggestionCardDetail.kind` (single-arm union seam, no ADR cited), `ConfirmSuggestionResult.ran` and `.outcome` (the result's only fields), `characterBulkTagFailureSchema.id` and `.error.code`, `GeneratedGreeting.costUsd`, `SnapshotRef.characterId` and `.createdAt` (whole-value `toEqual` at `tests/support/node/factories/character-library.int.test.ts:81`), `createCharacterSchema.starred` |
| total | 112 | |
