---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the contracts fields the unwired fields scan reports: discovery to persona

## What

`pnpm unwired fields` reports each of the fields below in `contracts`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `DuplicateCharacterPair.cslsScore` | `contracts/src/discovery/index.ts:155` | unreferenced | delete | delete the field |
| `DuplicateCharacterPair.model` | `contracts/src/discovery/index.ts:156` | unreferenced | delete | delete the field |
| `DuplicateCharacterPair.computedAt` | `contracts/src/discovery/index.ts:157` | unreferenced | delete | delete the field |
| `DuplicateChatPair.cslsScore` | `contracts/src/discovery/index.ts:169` | unreferenced | delete | delete the field |
| `DuplicateChatPair.model` | `contracts/src/discovery/index.ts:171` | unreferenced | delete | delete the field |
| `DuplicateChatPair.computedAt` | `contracts/src/discovery/index.ts:172` | unreferenced | delete | delete the field |
| `DistillStats.failed` | `contracts/src/discovery/index.ts:182` | never-read | delete | delete the field and its writes (`server/src/domain/discovery/verbs/distill.ts:157`) |
| `DistillStats.tagsStaged` | `contracts/src/discovery/index.ts:184` | never-read | delete | delete the field and its writes (`server/src/domain/discovery/verbs/distill.ts:157`) |
| `BrowseCharacter.setting` | `contracts/src/discovery/index.ts:194` | unreferenced | delete | delete the field |
| `BrowseCharacter.tags` | `contracts/src/discovery/index.ts:195` | unreferenced | delete | delete the field |
| `SimilarityGraphNode.degree` | `contracts/src/discovery/index.ts:244` | unreferenced | delete | delete the field |
| `SimilarityGraphNode.genre` | `contracts/src/discovery/index.ts:245` | unreferenced | delete | delete the field |
| `SimilarChat.similarity` | `contracts/src/discovery/index.ts:265` | unreferenced | delete | delete the field |
| `TagPair.a` | `contracts/src/discovery/index.ts:284` | unreferenced | delete | delete the field |
| `TagPair.b` | `contracts/src/discovery/index.ts:285` | unreferenced | delete | delete the field |
| `TagPair.count` | `contracts/src/discovery/index.ts:286` | unreferenced | delete | delete the field |
| `CatalogStats.genres` | `contracts/src/discovery/index.ts:291` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `CatalogStats.tones` | `contracts/src/discovery/index.ts:292` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `CatalogStats.tagPairs` | `contracts/src/discovery/index.ts:294` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ComparedCharacter.characterId` | `contracts/src/discovery/index.ts:307` | never-read | delete | delete the field and its writes (`server/src/domain/discovery/verbs/catalog.ts:89`) |
| `CharacterComparisonDeep.narrative` | `contracts/src/discovery/index.ts:343` | never-read | delete | delete the field and its writes (`server/src/domain/discovery/verbs/analyze.ts:83`) |
| `AskCardAnswer.characterId` | `contracts/src/discovery/index.ts:356` | never-read | delete | delete the field and its writes (`server/src/domain/discovery/verbs/analyze.ts:143`) |
| `AskCardAnswer.question` | `contracts/src/discovery/index.ts:357` | never-read | delete | delete the field and its writes (`server/src/domain/discovery/verbs/analyze.ts:143`) |
| `SwipeHotspot.characterId` | `contracts/src/discovery/index.ts:370` | unreferenced | delete | delete the field |
| `SwipeHotspot.characterName` | `contracts/src/discovery/index.ts:371` | unreferenced | delete | delete the field |
| `ForgottenGem.costUsd` | `contracts/src/discovery/index.ts:414` | never-read | delete | delete the field and its writes (`server/src/domain/discovery/verbs/economics-insights.ts:76`) |
| `CorpusCoverage.digests` | `contracts/src/discovery/index.ts:421` | unreferenced | delete | delete the field |
| `CorpusCoverage.segments` | `contracts/src/discovery/index.ts:422` | unreferenced | delete | delete the field |
| `HomeView.duplicateCounts.characters` | `contracts/src/discovery/index.ts:443` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `HomeView.duplicateCounts.chats` | `contracts/src/discovery/index.ts:443` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `HomeView.duplicateCounts.identicalCharacterPairs` | `contracts/src/discovery/index.ts:443` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `DossierNeighbor.score` | `contracts/src/discovery/index.ts:462` | unreferenced | delete | delete the field |
| `CharacterDossier.characterId` | `contracts/src/discovery/index.ts:474` | never-read | delete | delete the field and its writes (`server/src/domain/discovery/verbs/views.ts:93`) and the 1 test reference |
| `ThemeDetail.computedAt` | `contracts/src/discovery/index.ts:493` | unreferenced | delete | delete the field |
| `ThemeDetail.clusterIdx` | `contracts/src/discovery/index.ts:496` | unreferenced | delete | delete the field |
| `ThemeDetail.name` | `contracts/src/discovery/index.ts:497` | unreferenced | delete | delete the field |
| `ThemeDetail.model` | `contracts/src/discovery/index.ts:499` | unreferenced | delete | delete the field |
| `ImageFacets.chestSizes` | `contracts/src/discovery/index.ts:550` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ImageFacets.skinTones` | `contracts/src/discovery/index.ts:551` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ImageFacets.clothingStates` | `contracts/src/discovery/index.ts:553` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ImageFacets.nudityLevels` | `contracts/src/discovery/index.ts:554` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ImageFacets.exposedParts` | `contracts/src/discovery/index.ts:555` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ImageFacetMember.rating` | `contracts/src/discovery/index.ts:564` | unreferenced | delete | delete the field |
| `ImageFacetMember.artStyle` | `contracts/src/discovery/index.ts:565` | unreferenced | delete | delete the field |
| `CardTextStoreInput.kind` | `contracts/src/embeddings/card-store.ts:8` | never-read | delete | delete the field and its writes (`server/src/domain/admin/verbs/card-embed.ts:20`) and the 1 test reference |
| `StoreResultFields.contentHash` | `contracts/src/embeddings/card-store.ts:21` | never-read | delete | delete the field and its writes (`server/src/domain/embeddings/indexer/image.ts:54`) |
| `EmbeddingConnectionFacts.providerId` | `contracts/src/embeddings/connection.ts:10` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `EmbeddingConnectionFacts.api` | `contracts/src/embeddings/connection.ts:13` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `EmbeddingConnectionFacts.wire` | `contracts/src/embeddings/connection.ts:14` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `EmbeddingConnectionFacts.baseUrl` | `contracts/src/embeddings/connection.ts:15` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `EmbeddingConnectionFacts.features` | `contracts/src/embeddings/connection.ts:16` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `EmbeddingConnectionFacts.extras` | `contracts/src/embeddings/connection.ts:17` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `EmbeddingConnectionFacts.transport` | `contracts/src/embeddings/connection.ts:18` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `DocumentChunkStoreInput.kind` | `contracts/src/embeddings/document-vectors.ts:11` | never-read | delete | delete the field and its writes (`server/src/domain/databank/ingest/index.ts:108`) and the 1 test reference |
| `PruneDocumentChunksParams.model` | `contracts/src/embeddings/document-vectors.ts:34` | never-read | delete | delete the field and its writes (`server/src/domain/databank/ingest/index.ts:125`) |
| `WriteHubScoresResult.rowsUpdated` | `contracts/src/embeddings/index.ts:227` | never-read | delete | delete the field and its writes (`server/src/domain/embeddings/verbs/write-hub-scores.ts:15`) |
| `DocumentVectorSweepReceipt.ownerId` | `contracts/src/embeddings/owner-ops.ts:26` | never-read | delete | delete the field and its writes (`server/src/domain/embeddings/verbs/vector-sweep-ops.ts:26`) |
| `DocumentVectorSweepReceipt.generation` | `contracts/src/embeddings/owner-ops.ts:27` | never-read | delete | delete the field and its writes (`server/src/domain/embeddings/verbs/vector-sweep-ops.ts:26`) |
| `AdminUserView.role` | `contracts/src/identity/index.ts:35` | unreferenced | delete | delete the field and the 7 test references |
| `AdminUserView.kind` | `contracts/src/identity/index.ts:37` | unreferenced | delete | delete the field and the 1 test reference |
| `AdminUserView.updatedAt` | `contracts/src/identity/index.ts:40` | unreferenced | delete | delete the field and the 1 test reference |
| `ipCertificateStatusSchemas.active.setting` | `contracts/src/identity/index.ts:277` | never-read | delete | delete the key and its writes (`server/src/domain/share/certificate/controller.ts:137`) and the 2 test references |
| `Principal.externalId` | `contracts/src/identity/index.ts:354` | never-read | delete | delete the field and its writes (`server/src/entry/auth/seam.ts:155`) and the 3 test references |
| `viewerViewSchema.globalRole` | `contracts/src/identity/index.ts:365` | unreferenced | delete | delete the key and the 20 test references |
| `generatePictureRequestFields.n` | `contracts/src/imagery/index.ts:245` | unreferenced | delete | delete the key and the 4 test references |
| `generatePictureRequestFields.size` | `contracts/src/imagery/index.ts:246` | unreferenced | delete | delete the key and the 2 test references |
| `generateImageActionArgsFields.negative` | `contracts/src/imagery/index.ts:282` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/automation/engine/arm-executors.ts:323` |
| `generateImageActionArgsFields.size` | `contracts/src/imagery/index.ts:284` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/automation/engine/arm-executors.ts:325` |
| `GeneratedPictureImage.generationId` | `contracts/src/imagery/index.ts:304` | never-read | delete | delete the field and its writes (`server/src/domain/imagery/substrate/generate-core.ts:93`) and the 1 test reference |
| `GeneratedPictureImage.block` | `contracts/src/imagery/index.ts:305` | never-read | delete | delete the field and its writes (`server/src/domain/imagery/substrate/generate-core.ts:93`) |
| `GeneratedPicture.prompt` | `contracts/src/imagery/index.ts:318` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `GeneratedPicture.promptSource` | `contracts/src/imagery/index.ts:319` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `GeneratedPicture.mode` | `contracts/src/imagery/index.ts:320` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `GeneratedPicture.model` | `contracts/src/imagery/index.ts:321` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `GeneratedPicture.costUsd` | `contracts/src/imagery/index.ts:322` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `GenerationProvenance.generationId` | `contracts/src/imagery/index.ts:331` | unreferenced | delete | delete the field and the 3 test references |
| `GenerationProvenance.assetId` | `contracts/src/imagery/index.ts:332` | unreferenced | delete | delete the field and the 2 test references |
| `GenerationProvenance.negativePrompt` | `contracts/src/imagery/index.ts:335` | unreferenced | delete | delete the field |
| `GenerationProvenance.usage` | `contracts/src/imagery/index.ts:338` | never-read | delete | delete the field and its writes (`server/src/domain/imagery/persistence/queries.ts:161`) and the 10 test references |
| `GenerationProvenance.subjectCharacterId` | `contracts/src/imagery/index.ts:339` | unreferenced | delete | delete the field and the 1 test reference |
| `GenerationProvenance.identityHash` | `contracts/src/imagery/index.ts:344` | unreferenced | delete | delete the field and the 1 test reference |
| `GenerationProvenance.createdAt` | `contracts/src/imagery/index.ts:346` | unreferenced | delete | delete the field |
| `ExtractedPrompt.mode` | `contracts/src/imagery/index.ts:353` | never-read | delete | delete the field and its writes (`server/src/domain/imagery/verbs/extract-prompt.ts:100`) |
| `GeneratePictureFields.identityHash` | `contracts/src/imagery/index.ts:447` | never-written | delete | delete the field and the branch that reads its default at `server/src/domain/imagery/verbs/generate-picture.ts:168` |
| `importedCardSchema.importHash` | `contracts/src/import/card-result.ts:9` | never-read | delete | delete the key and its writes (`server/src/domain/import/loader/import-card-batch.ts:23`) and the 1 test reference |
| `chatImportResultSchema.imported.filename` | `contracts/src/import/chat-result.ts:5` | never-read | delete | delete the key and its writes (`server/src/entry/http/import-chat.ts:68`) |
| `chatImportResultSchema.imported.created` | `contracts/src/import/chat-result.ts:5` | never-read | delete | delete the key and its writes (`server/src/entry/http/import-chat.ts:68`) |
| `cardLorebookRestoreResultSchema.characterId` | `contracts/src/import/lorebook-restore.ts:7` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `cardLorebookRestoreResultSchema.worldBookId` | `contracts/src/import/lorebook-restore.ts:8` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `cardLorebookRestoreResultSchema.entryCount` | `contracts/src/import/lorebook-restore.ts:9` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `prefixCacheSchemas.none.format` | `contracts/src/inference/cache-policy.ts:31` | never-read | delete | delete the key and its writes (`inference/src/funnel/resolve-cache.ts:21`) and the 6 test references |
| `prefixCacheSchemas.markers.format` | `contracts/src/inference/cache-policy.ts:47` | never-read | delete | delete the key and its writes (`inference/src/funnel/resolve-cache.ts:21`) and the 6 test references |
| `cachePolicySchema.implicit.refreshOnHit` | `contracts/src/inference/cache-policy.ts:63` | never-read | delete | delete the key and its writes (`inference/src/funnel/resolve-cache.ts:157`) and the 1 test reference |
| `embeddingCapabilitySchema.output` | `contracts/src/inference/capability/embedding.ts:28` | never-read | delete | delete the key and its writes (`contracts/src/inference/capability/embedding.ts:76`) and the 1 test reference |
| `samplingCapabilitySchema.drySequenceBreakers` | `contracts/src/inference/capability/generation.ts:207` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `client/src/features/preset/lib/capability-panel-model.ts:55` |
| `reasoningCapabilitySchema.supportsMaxTokens` | `contracts/src/inference/capability/generation.ts:264` | never-read | delete | delete the key and its writes (`inference/src/capability/sources/advertised/openrouter.ts:58`) |
| `turnsCapabilitySchema.requestAutomaticPromptCache` | `contracts/src/inference/capability/generation.ts:290` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `inference/src/funnel/resolve-cache.ts:26` |
| `turnsCapabilitySchema.disablesImplicitPromptCache` | `contracts/src/inference/capability/generation.ts:291` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `inference/src/funnel/resolve-cache.ts:146` |
| `turnsCapabilitySchema.cacheRetentionRefresh` | `contracts/src/inference/capability/generation.ts:292` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `inference/src/funnel/resolve-cache.ts:157` |
| `turnsCapabilitySchema.cacheRetentionSeconds` | `contracts/src/inference/capability/generation.ts:294` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `inference/src/funnel/resolve-cache.ts:156` |
| `generationCapabilitySchema.tools.parallel` | `contracts/src/inference/capability/generation.ts:350` | never-read | delete | delete the key and its writes (`inference/src/capability/sources/curated/anthropic.ts:58`) and the 12 test references |
| `generationCapabilitySchema.output.structuredLimits` | `contracts/src/inference/capability/generation.ts:372` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `inference/src/structured/target.ts:79` |
| `capabilityEvidenceSchema.tier` | `contracts/src/inference/capability/override.ts:40` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `capabilityEvidenceSchema.dated` | `contracts/src/inference/capability/override.ts:41` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `capabilityEvidenceSchema.cite` | `contracts/src/inference/capability/override.ts:42` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `capabilityOverrideSchema.features` | `contracts/src/inference/capability/override.ts:69` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `inference/src/resolve/behave-as.ts:18` |
| `capabilityOverrideSchema.evidence` | `contracts/src/inference/capability/override.ts:70` | never-read | delete | delete the key and its writes (`inference/src/capability/sources/curated/anthropic.ts:35`) |
| `modelCatalogEntrySchema.completionPrice` | `contracts/src/inference/catalog.ts:29` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `modelCatalogEntrySchema.cacheReadPrice` | `contracts/src/inference/catalog.ts:30` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `modelCatalogEntrySchema.cacheWritePrice` | `contracts/src/inference/catalog.ts:31` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `agentSdkModelSchema.description` | `contracts/src/inference/catalog.ts:70` | never-read | delete | delete the key and its writes (`inference/src/backends/agent-sdk/catalog.ts:48`) |
| `bindingViewSchema.unavailableCause` | `contracts/src/inference/connection-view.ts:19` | never-read | delete | delete the key and its writes (`server/src/domain/connection/verbs/bindings.ts:115`) and the 1 test reference |
| `bindingActorSchema.ruleId` | `contracts/src/inference/connection-view.ts:25` | unreferenced | delete | delete the key |
| `bindingActorSchema.pluginId` | `contracts/src/inference/connection-view.ts:26` | never-read | delete | delete the key and its writes (`client/src/features/plugin/components/plugin-model-bindings.tsx:99`) and the 3 test references |
| `endpointFeaturesSchema.keepAlive` | `contracts/src/inference/features.ts:200` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `inference/src/backends/openai-compat/model.ts:150` |
| `endpointFeaturesSchema.numBatch` | `contracts/src/inference/features.ts:202` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `inference/src/backends/openai-compat/model.ts:151` |
| `endpointFeaturesSchema.embedBatch` | `contracts/src/inference/features.ts:215` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `inference/src/backends/openai-compat/embed.ts:174` |
| `endpointFeaturesSchema.requestTimeoutMs` | `contracts/src/inference/features.ts:218` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `inference/src/contract/roles.ts:42` |
| `promptCacheSettingsSchema.retention` | `contracts/src/inference/prompt-cache.ts:27` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `inference/src/funnel/resolve-cache.ts:110` |
| `promptCacheSettingsSchema.requestAutomatic` | `contracts/src/inference/prompt-cache.ts:29` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `inference/src/funnel/resolve-cache.ts:25` |
| `promptCacheSettingsSchema.disableImplicit` | `contracts/src/inference/prompt-cache.ts:31` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `inference/src/funnel/resolve-cache.ts:146` |
| `TaskDefFields.scope` | `contracts/src/inference/tasks.ts:31` | unreferenced | delete | delete the field |
| `TaskDefFields.spend` | `contracts/src/inference/tasks.ts:32` | unreferenced | delete | delete the field and the 1 test reference |
| `tokenDetailsSchema.output.modality` | `contracts/src/inference/usage.ts:84` | unreferenced | delete | delete the key |
| `tokenDetailsSchema.output.tokens` | `contracts/src/inference/usage.ts:84` | unreferenced | delete | delete the key |
| `GenerationUsageProjection.knownSubtotal` | `contracts/src/inference/usage.ts:124` | never-read | delete | delete the field and its writes (`contracts/src/inference/usage.ts:241`) |
| `WireSchemaCheck.fits` | `contracts/src/inference/wire-limits.ts:108` | never-read | delete | delete the field and its writes (`contracts/src/inference/wire-limits.ts:293`) and the 2 test references |
| `WireSchemaCheck.violations` | `contracts/src/inference/wire-limits.ts:109` | never-read | delete | delete the field and its writes (`contracts/src/inference/wire-limits.ts:293`) and the 3 test references |
| `WireDef.deltas` | `contracts/src/inference/wires.ts:20` | never-read | delete | delete the field and its writes (`contracts/src/inference/wires.ts:27`) |
| `notificationEventSchema.offer` | `contracts/src/notifications/index.ts:109` | never-read | delete | delete the key and its writes (`server/src/domain/chat/verbs/participants.ts:1054`) and the 2 test references |
| `notificationEventSchema.source.kind` | `contracts/src/notifications/index.ts:149` | never-read | delete | delete the key and its writes (`server/src/domain/automation/engine/dispatch.ts:158`) |
| `notificationEventSchema.source.ruleId` | `contracts/src/notifications/index.ts:149` | never-read | delete | delete the key and its writes (`server/src/domain/automation/engine/dispatch.ts:158`) |
| `notificationEventSchema.source.pluginId` | `contracts/src/notifications/index.ts:150` | unreferenced | delete | delete the key |
| `InboxViewFields.id` | `contracts/src/notifications/index.ts:224` | unreferenced | delete | delete the field and the 113 test references |
| `InboxViewFields.actionable` | `contracts/src/notifications/index.ts:243` | unreferenced | delete | delete the field and the 13 test references |
| `InboxViewFields.readAt` | `contracts/src/notifications/index.ts:247` | unreferenced | delete | delete the field and the 11 test references |
| `InboxViewFields.dismissedAt` | `contracts/src/notifications/index.ts:250` | unreferenced | delete | delete the field and the 10 test references |
| `InboxViewFields.createdAt` | `contracts/src/notifications/index.ts:251` | unreferenced | delete | delete the field and the 2 test references |
| `inboxViewFields.seq` | `contracts/src/notifications/index.ts:283` | unreferenced | delete | delete the key and the 2 test references |
| `inboxViewFields.dismissedAt` | `contracts/src/notifications/index.ts:285` | unreferenced | delete | delete the key |
| `inboxViewFields.createdAt` | `contracts/src/notifications/index.ts:286` | unreferenced | delete | delete the key |
| `PresenceView.userId` | `contracts/src/notifications/index.ts:331` | never-read | delete | delete the field and its writes (`server/src/transport/trpc/presence-registry.ts:54`) |
| `PresenceView.lastSeenAt` | `contracts/src/notifications/index.ts:333` | never-read | delete | delete the field and its writes (`server/src/transport/trpc/presence-registry.ts:54`) |
| `ListInboxResult.nextCursor` | `contracts/src/notifications/index.ts:339` | never-read | delete | delete the field and its writes (`server/src/domain/notifications/verbs/list.ts:28`) and the 5 test references |
| `MarkAllReadResult.markedCount` | `contracts/src/notifications/index.ts:343` | never-read | delete | delete the field and its writes (`server/src/domain/notifications/verbs/read.ts:18`) and the 3 test references |
| `personaMetadataSchema.seededDefault` | `contracts/src/persona/schemas.ts:34` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/persona/verbs/find-seeded-default.ts:7` |
| `PersonaDetail.createdAt` | `contracts/src/persona/schemas.ts:130` | never-read | delete | delete the field and its writes (`server/src/domain/persona/persistence/queries.ts:278`) and the 4 test references |
| `RemovePersonaResult.deleted` | `contracts/src/persona/schemas.ts:162` | never-read | delete | delete the field and its writes (`server/src/domain/persona/verbs/remove.ts:73`) |
| `DisconnectResult.disconnected` | `contracts/src/persona/schemas.ts:168` | never-read | delete | delete the field and its writes (`server/src/domain/persona/verbs/connection/disconnect.ts:33`) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
