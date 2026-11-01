---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the contracts fields the unwired fields scan reports: settings to world-info

## What

`pnpm unwired fields` reports each of the fields below in `contracts`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `seedsSchema.welcomeAssistantCharacterId` | `contracts/src/settings/index.ts:416` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/chat/verbs/resolve-room-inputs.ts:122` |
| `seedsSchema.defaultPresetId` | `contracts/src/settings/index.ts:418` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/chat/verbs/resolve-room-inputs.ts:44` |
| `seedsSchema.summarizePreset` | `contracts/src/settings/index.ts:419` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/preset/verbs/side-gen-params.ts:42` |
| `profileSchema.avatarAssetId` | `contracts/src/settings/index.ts:688` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/persona/verbs/resolve-user-publics.ts:26` |
| `userSettingsSchema.schemaVersion` | `contracts/src/settings/index.ts:700` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/settings/persistence/queries.ts:148` |
| `userSettingsSchema.groupDefaults` | `contracts/src/settings/index.ts:719` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `client/src/state/config-section-partition.ts:68` |
| `EffectiveAppConfig.importSkipCharacters` | `contracts/src/settings/index.ts:887` | never-read | delete | delete the field and its writes (`server/src/domain/settings/effective-config/layer.ts:86`) |
| `UserSettingsView.userId` | `contracts/src/settings/index.ts:919` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `UserSettingsView.schemaVersion` | `contracts/src/settings/index.ts:920` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `UserSettingsView.updatedAt` | `contracts/src/settings/index.ts:922` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `GlobalSettingView.key` | `contracts/src/settings/index.ts:939` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `GlobalSettingView.value` | `contracts/src/settings/index.ts:940` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `GlobalSettingView.updatedAt` | `contracts/src/settings/index.ts:941` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ThemeView.createdAt` | `contracts/src/settings/index.ts:955` | never-read | delete | delete the field and its writes (`server/src/domain/settings/substrate/theme-views.ts:29`) |
| `ThemeView.updatedAt` | `contracts/src/settings/index.ts:956` | never-read | delete | delete the field and its writes (`server/src/domain/settings/substrate/theme-views.ts:30`) |
| `statsDeltaSchema.tokensInEstimatedSamples` | `contracts/src/stats/index.ts:46` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/stats/write/apply-delta.ts:80` |
| `statsDeltaSchema.tokensOutEstimatedSamples` | `contracts/src/stats/index.ts:48` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/stats/write/apply-delta.ts:82` |
| `statsDeltaSchema.messageDatesApprox` | `contracts/src/stats/index.ts:75` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/stats/write/apply-delta.ts:263` |
| `statsDeltaSchema.dailyTokensInEstimatedSamples` | `contracts/src/stats/index.ts:80` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/stats/write/apply-delta.ts:256` |
| `statsDeltaSchema.dailyTokensOutEstimatedSamples` | `contracts/src/stats/index.ts:82` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/stats/write/apply-delta.ts:258` |
| `statsDeltaSchema.modelTokensInEstimatedSamples` | `contracts/src/stats/index.ts:88` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/stats/write/apply-delta.ts:309` |
| `statsDeltaSchema.modelTokensOutEstimatedSamples` | `contracts/src/stats/index.ts:90` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/stats/write/apply-delta.ts:311` |
| `CharacterEconomics.generations` | `contracts/src/stats/index.ts:368` | unreferenced | delete | delete the field |
| `CharacterEconomics.tokensIn` | `contracts/src/stats/index.ts:369` | unreferenced | delete | delete the field |
| `CharacterEconomics.tokensInProvenance` | `contracts/src/stats/index.ts:370` | unreferenced | delete | delete the field |
| `CharacterEconomics.cacheReadTokens` | `contracts/src/stats/index.ts:379` | unreferenced | delete | delete the field |
| `CharacterEconomics.cacheWriteTokens` | `contracts/src/stats/index.ts:380` | unreferenced | delete | delete the field |
| `ExtraStats.cacheReadTokens` | `contracts/src/stats/index.ts:410` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ExtraStats.cacheWriteTokens` | `contracts/src/stats/index.ts:411` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ExtraStats.maxContextTokens` | `contracts/src/stats/index.ts:414` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ExtraStats.avgReplyWords` | `contracts/src/stats/index.ts:420` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `OwnerStatsView.userTurns` | `contracts/src/stats/index.ts:427` | never-read | delete | delete the field and its writes (`server/src/domain/stats/persistence/rollups.ts:46`) |
| `OwnerStatsView.systemTurns` | `contracts/src/stats/index.ts:430` | never-read | delete | delete the field and its writes (`server/src/domain/stats/persistence/rollups.ts:48`) |
| `OwnerStatsView.swipeWords` | `contracts/src/stats/index.ts:434` | never-read | delete | delete the field and its writes (`server/src/domain/stats/persistence/rollups.ts:52`) |
| `OwnerStatsView.tokensIn` | `contracts/src/stats/index.ts:436` | never-read | delete | delete the field and its writes (`server/src/domain/stats/persistence/rollups.ts:53`) and the 3 test references |
| `OwnerStatsView.tokensOut` | `contracts/src/stats/index.ts:437` | never-read | delete | delete the field and its writes (`server/src/domain/stats/persistence/rollups.ts:54`) and the 3 test references |
| `OwnerStatsView.tokensInProvenance` | `contracts/src/stats/index.ts:438` | never-read | delete | delete the field and its writes (`server/src/domain/stats/persistence/rollups.ts:55`) |
| `OwnerStatsView.tokensOutProvenance` | `contracts/src/stats/index.ts:439` | never-read | delete | delete the field and its writes (`server/src/domain/stats/persistence/rollups.ts:56`) |
| `OwnerStatsView.avgGenMs` | `contracts/src/stats/index.ts:441` | unreferenced | delete | delete the field |
| `OwnerStatsView.p50GenMs` | `contracts/src/stats/index.ts:442` | unreferenced | delete | delete the field |
| `OwnerStatsView.p90GenMs` | `contracts/src/stats/index.ts:443` | unreferenced | delete | delete the field |
| `OwnerStatsView.avgTtftMs` | `contracts/src/stats/index.ts:444` | unreferenced | delete | delete the field |
| `OwnerStatsView.p50TtftMs` | `contracts/src/stats/index.ts:445` | unreferenced | delete | delete the field |
| `OwnerStatsView.p90TtftMs` | `contracts/src/stats/index.ts:446` | unreferenced | delete | delete the field |
| `OwnerStatsView.reasoningRate` | `contracts/src/stats/index.ts:447` | never-read | delete | delete the field and its writes (`server/src/domain/stats/persistence/rollups.ts:59`) |
| `OwnerStatsView.contentChars` | `contracts/src/stats/index.ts:449` | never-read | delete | delete the field and its writes (`server/src/domain/stats/persistence/rollups.ts:60`) |
| `CharacterStatsView.characterId` | `contracts/src/stats/index.ts:456` | never-read | delete | delete the field and its writes (`server/src/domain/stats/persistence/rollups.ts:84`) |
| `CharacterStatsView.name` | `contracts/src/stats/index.ts:457` | never-read | delete | delete the field and its writes (`server/src/domain/stats/persistence/rollups.ts:85`) |
| `LeaderboardRow.chats` | `contracts/src/stats/index.ts:463` | unreferenced | delete | delete the field |
| `LeaderboardRow.userTurns` | `contracts/src/stats/index.ts:464` | unreferenced | delete | delete the field |
| `LeaderboardRow.swipes` | `contracts/src/stats/index.ts:466` | unreferenced | delete | delete the field |
| `LeaderboardRow.reasoningRate` | `contracts/src/stats/index.ts:470` | unreferenced | delete | delete the field |
| `LeaderboardRow.firstChatAt` | `contracts/src/stats/index.ts:471` | unreferenced | delete | delete the field |
| `LeaderboardRow.lastActivityAt` | `contracts/src/stats/index.ts:472` | unreferenced | delete | delete the field |
| `ActivityBucket.swipes` | `contracts/src/stats/index.ts:492` | unreferenced | delete | delete the field |
| `ActivityBucket.tokensIn` | `contracts/src/stats/index.ts:493` | unreferenced | delete | delete the field |
| `ActivityBucket.tokensInProvenance` | `contracts/src/stats/index.ts:495` | unreferenced | delete | delete the field |
| `ActivityBucket.genTimeMs` | `contracts/src/stats/index.ts:497` | unreferenced | delete | delete the field |
| `ActivityBucket.messageDatesApprox` | `contracts/src/stats/index.ts:498` | unreferenced | delete | delete the field |
| `ModelStatRow.tokensIn` | `contracts/src/stats/index.ts:507` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ModelStatRow.tokensInProvenance` | `contracts/src/stats/index.ts:509` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ModelStatRow.avgGenMs` | `contracts/src/stats/index.ts:512` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ModelStatRow.p50TtftMs` | `contracts/src/stats/index.ts:514` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ModelStatRow.reasoningRate` | `contracts/src/stats/index.ts:516` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ModelStatRow.reasoningMs` | `contracts/src/stats/index.ts:519` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ModelStatRow.cacheHitRate` | `contracts/src/stats/index.ts:520` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `WrappedSummary.lastActivityAt` | `contracts/src/stats/index.ts:539` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `WrappedSummary.reasoningMs` | `contracts/src/stats/index.ts:546` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `WrappedSummary.throughputTps` | `contracts/src/stats/index.ts:550` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `WrappedSummary.computedAt` | `contracts/src/stats/index.ts:553` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `statsFreshnessSchema.stale` | `contracts/src/stats/index.ts:678` | never-read | delete | delete the key and its writes (`server/src/domain/stats/persistence/rollups.ts:272`) |
| `ReconcileStatsResult.buckets` | `contracts/src/stats/index.ts:732` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ReconcileStatsResult.models` | `contracts/src/stats/index.ts:733` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ReconcileStatsResult.computedAt` | `contracts/src/stats/index.ts:734` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `statsLeaderboardInputSchema.limit` | `contracts/src/stats/index.ts:763` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/transport/trpc/routers/stats.ts:38` |
| `createTagSchema.color` | `contracts/src/tag/index.ts:57` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/tag/verbs/create.ts:29` |
| `createTagSchema.source` | `contracts/src/tag/index.ts:58` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/tag/verbs/create.ts:30` |
| `PruneUnusedResult.removed` | `contracts/src/tag/index.ts:214` | never-read | delete | delete the field and its writes (`server/src/domain/tag/verbs/prune.ts:24`) and the 1 test reference |
| `TagLibraryImportResult.total` | `contracts/src/tag/index.ts:252` | never-read | delete | delete the field and its writes (`server/src/domain/tag/verbs/import.ts:67`) |
| `themeSchema.createdAt` | `contracts/src/theme/index.ts:58` | never-read | delete | delete the key and its writes (`client/src/features/config/components/appearance-looks-section.tsx:74`) |
| `themeSchema.updatedAt` | `contracts/src/theme/index.ts:59` | never-read | delete | delete the key and its writes (`client/src/features/config/components/appearance-looks-section.tsx:74`) |
| `ToolExecutionData.triggeredBy` | `contracts/src/tool-use/index.ts:23` | unreferenced | delete | delete the field and the 1 test reference |
| `uploadCapsSchema.importTotal` | `contracts/src/uploads/index.ts:98` | never-read | delete | delete the key and its writes (`contracts/src/uploads/index.ts:117`) and the 2 test references |
| `VersionedConfig.default` | `contracts/src/versioned-config/index.ts:136` | never-read | delete | delete the field and its writes (`contracts/src/versioned-config/index.ts:217`) |
| `VersionedConfig.currentVersion` | `contracts/src/versioned-config/index.ts:137` | never-read | delete | delete the field and its writes (`contracts/src/versioned-config/index.ts:218`) and the 1 test reference |
| `WorkloadError.kind` | `contracts/src/workloads/events.ts:33` | never-read | delete | delete the field and its writes (`server/src/domain/workloads/persistence/queries.ts:450`) |
| `WorkloadEventBase.kind` | `contracts/src/workloads/events.ts:46` | never-read | delete | delete the field and its writes (`server/src/domain/workloads/verbs/cancel.ts:23`) and the 1 test reference |
| `databankReindexWorkloadParams.embedderChanged` | `contracts/src/workloads/params.ts:61` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/databank/workload-contributions.ts:98` |
| `importStWorkloadParams.dryRun` | `contracts/src/workloads/params.ts:83` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/import/workload-contributions.ts:195` |
| `WorkloadParamsByKind.csls` | `contracts/src/workloads/params.ts:112` | unreferenced | delete | delete the field |
| `MaintenanceResult.mergedKeys` | `contracts/src/workloads/result.ts:36` | never-written | delete | delete the field and the branch that reads its default at `contracts/src/workloads/result.ts:110` |
| `BundleImportWorkloadResult.memoryScope` | `contracts/src/workloads/result.ts:51` | never-read | delete | delete the field and its writes (`server/src/domain/import/loader/workload-drivers.ts:21`) |
| `ImportTokenUsageBackfillResult.ownersScanned` | `contracts/src/workloads/result.ts:63` | never-read | delete | delete the field and its writes (`server/src/domain/import/verbs/backfill-token-usage.ts:139`) |
| `ImportTokenUsageBackfillResult.ownersReconciled` | `contracts/src/workloads/result.ts:64` | never-read | delete | delete the field and its writes (`server/src/domain/import/verbs/backfill-token-usage.ts:140`) |
| `DeferredResult.deferred` | `contracts/src/workloads/result.ts:70` | unreferenced | delete | delete the field |
| `WorkloadResultByKind.index` | `contracts/src/workloads/result.ts:78` | unreferenced | delete | delete the field |
| `WorkloadResultByKind.csls` | `contracts/src/workloads/result.ts:85` | unreferenced | delete | delete the field |
| `WorkloadRowBase.lane` | `contracts/src/workloads/views.ts:38` | unreferenced | delete | delete the field and the 1 test reference |
| `WorkloadPoisonRow.params` | `contracts/src/workloads/views.ts:64` | never-read | delete | delete the field and its writes (`server/src/domain/workloads/persistence/queries.ts:164`) |
| `WorkloadPoisonRow.result` | `contracts/src/workloads/views.ts:65` | never-read | delete | delete the field and its writes (`server/src/domain/workloads/persistence/queries.ts:164`) and the 1 test reference |
| `workloadScheduleRefSchema.id` | `contracts/src/workloads/views.ts:262` | never-read | delete | delete the key and its writes (`server/src/domain/workloads/verbs/create-schedule.ts:43`) and the 25 test references |
| `workloadScheduleViewSchema.params` | `contracts/src/workloads/views.ts:275` | unreferenced | delete | delete the key |
| `workloadScheduleViewSchema.lastRunAt` | `contracts/src/workloads/views.ts:278` | unreferenced | delete | delete the key and the 3 test references |
| `workloadScheduleViewSchema.createdAt` | `contracts/src/workloads/views.ts:280` | unreferenced | delete | delete the key |
| `workloadScheduleViewSchema.updatedAt` | `contracts/src/workloads/views.ts:281` | unreferenced | delete | delete the key |
| `workloadListInputSchema.status` | `contracts/src/workloads/views.ts:288` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/transport/trpc/routers/workloads.ts:123` |
| `workloadListInputSchema.since` | `contracts/src/workloads/views.ts:289` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/transport/trpc/routers/workloads.ts:124` |
| `workloadListInputSchema.limit` | `contracts/src/workloads/views.ts:290` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/transport/trpc/routers/workloads.ts:125` |
| `LinkCarriedBooksResult.linked` | `contracts/src/world-info/owner-ops.ts:44` | never-read | delete | delete the field and its writes (`server/src/domain/world-info/persistence/link-carried-books.ts:41`) |
| `LinkCarriedBooksResult.skipped` | `contracts/src/world-info/owner-ops.ts:45` | never-read | delete | delete the field and its writes (`server/src/domain/world-info/persistence/link-carried-books.ts:41`) |
| `createBookSchema.description` | `contracts/src/world-info/schemas.ts:35` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/world-info/verbs/books/create.ts:15` |
| `loreEntryProvenanceSchema.span` | `contracts/src/world-info/schemas.ts:54` | never-read | delete | delete the key and its writes (`server/src/domain/world-info/verbs/entries/upsert-entries.ts:39`) |
| `loreEntryProvenanceSchema.span.fromSeq` | `contracts/src/world-info/schemas.ts:54` | unreferenced | delete | delete the key |
| `loreEntryProvenanceSchema.span.toSeq` | `contracts/src/world-info/schemas.ts:54` | unreferenced | delete | delete the key |
| `entryMetadataSchema.scopeMode` | `contracts/src/world-info/schemas.ts:69` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `client/src/features/world-info/lib/entry-editor-model.ts:64` |
| `entryMetadataSchema.keyMode` | `contracts/src/world-info/schemas.ts:72` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `client/src/features/world-info/lib/entry-editor-model.ts:92` |
| `entryMetadataSchema.inject` | `contracts/src/world-info/schemas.ts:73` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `client/src/features/world-info/lib/entry-editor-model.ts:55` |
| `entryMetadataSchema.position` | `contracts/src/world-info/schemas.ts:74` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `client/src/features/world-info/lib/entry-editor-model.ts:65` |
| `createEntrySchema.description` | `contracts/src/world-info/schemas.ts:99` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/world-info/verbs/entries/create.ts:23` |
| `createEntrySchema.keys` | `contracts/src/world-info/schemas.ts:103` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/world-info/verbs/entries/create.ts:24` |
| `createEntrySchema.enabled` | `contracts/src/world-info/schemas.ts:104` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/world-info/verbs/entries/create.ts:25` |
| `createEntrySchema.priority` | `contracts/src/world-info/schemas.ts:105` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/world-info/verbs/entries/create.ts:26` |
| `createEntrySchema.ignoreBudget` | `contracts/src/world-info/schemas.ts:107` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/world-info/verbs/entries/create.ts:27` |
| `createEntrySchema.metadata` | `contracts/src/world-info/schemas.ts:108` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/world-info/verbs/entries/create.ts:28` |
| `BookView.createdAt` | `contracts/src/world-info/schemas.ts:129` | never-read | delete | delete the field and its writes (`server/src/domain/world-info/persistence/queries.ts:41`) |
| `EntryView.worldBookId` | `contracts/src/world-info/schemas.ts:157` | never-read | delete | delete the field and its writes (`server/src/domain/world-info/persistence/queries.ts:48`) and the 7 test references |
| `BookAttachmentView.role` | `contracts/src/world-info/schemas.ts:173` | never-read | delete | delete the field and its writes (`server/src/domain/world-info/persistence/queries.ts:61`) |
| `bookAttachmentTargetsSchema.characters.characterId` | `contracts/src/world-info/schemas.ts:222` | unreferenced | delete | delete the key |
| `bookAttachmentTargetsSchema.characters.role` | `contracts/src/world-info/schemas.ts:222` | unreferenced | delete | delete the key |
| `RemoveResult.deleted` | `contracts/src/world-info/schemas.ts:226` | never-read | delete | delete the field and its writes (`server/src/domain/world-info/verbs/books/remove.ts:43`) |
| `DetachResult.detached` | `contracts/src/world-info/schemas.ts:229` | never-read | delete | delete the field and its writes (`server/src/domain/world-info/verbs/attachments/detach-from-character.ts:22`) |
| `ReorderResult.reordered` | `contracts/src/world-info/schemas.ts:235` | never-read | delete | delete the field and its writes (`server/src/domain/world-info/verbs/entries/reorder.ts:24`) |
| `UpsertEntriesResult.inserted` | `contracts/src/world-info/schemas.ts:308` | unreferenced | delete | delete the field |
| `UpsertEntriesResult.updated` | `contracts/src/world-info/schemas.ts:309` | unreferenced | delete | delete the field |
| `UpsertEntriesResult.skippedHandEdited` | `contracts/src/world-info/schemas.ts:310` | unreferenced | delete | delete the field |
| `LoreEntryIndexRow.keys` | `contracts/src/world-info/schemas.ts:324` | unreferenced | delete | delete the field |
| `LoreConstantCanonRow.title` | `contracts/src/world-info/schemas.ts:331` | unreferenced | delete | delete the field |
| `LoreConstantCanonRow.content` | `contracts/src/world-info/schemas.ts:332` | unreferenced | delete | delete the field |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

Judged from the fresh `fields-tsapi.json` (`unwired`, settings to world-info): 111 rows. The table above is the older run.

- Deleted, 74 rows: `VersionedConfig` default and currentVersion; `ToolExecutionData.triggeredBy`; `uploadCapsSchema.importTotal`; `themeSchema` and `themeViewSchema` createdAt and updatedAt; `UserSettingsView` userId, schemaVersion and updatedAt; the unread stats view fields (`CharacterEconomics`, `ExtraStats`, `OwnerStatsView`, `CharacterStatsView`, `LeaderboardRow`, `ActivityBucket`, `ModelStatRow`, `WrappedSummary`, `statsFreshnessSchema.stale`, `ReconcileStatsResult`, `statsDeltaSchema.messageDatesApprox`); `TagLibraryImportResult.total`, `createTagSchema.color`, `updateTagSchema.source`; `ImportTokenUsageBackfillResult` owners counts, `WorkloadError.kind`, `workloadListInputSchema` status and since; `BookView.createdAt`, `LinkCarriedBooksResult.skipped`, `UpsertEntriesResult` (the op returns void), `LoreEntryIndexRow.keys`, the provenance `span`, `createEntrySchema` description, enabled, ignoreBudget and metadata.
- Kept with a cited writer or reader, 26 rows: six `statsDeltaSchema` `*EstimatedSamples` keys (computed key, `packages/server/src/domain/chat/substrate/stats-delta.ts:310`); `createTagSchema.source` (`tests/support/node/corpus-seed.ts:170`); `createBookSchema.description`, `createEntrySchema` keys and priority (`tooling/src/seed/ops/demo.ts:236-258`); `entryMetadataSchema` scopeMode, keyMode, inject and position (written by the entry editor through `updateEntry`, `packages/client/src/features/world-info/lib/entry-editor-model.ts`); `EntryView.worldBookId` (`tests/support/iso/corpus-library.ts:47`); `WorkloadRowBase.lane` (`packages/client/src/features/workloads/components/workloads-jobs-section.tsx:203` groups by it); `workloadScheduleViewSchema` createdAt, updatedAt and lastRunAt (the strict decode of the server row); `statsLeaderboardInputSchema.limit` (`tests/support/node/corpus-stats-settings.ts:153`); `workloadListInputSchema.limit` (`tests/e2e/corpus-settings.spec.ts:64`); `userSettingsSchema.schemaVersion` (the in-blob version probe in `packages/contracts/src/versioned-config/index.ts`); `profileSchema.avatarAssetId` (asset GC reference path, `packages/server/src/domain/assets/persistence/asset-refs.ts:80`); `WorkloadResultByKind` index and csls, `WorkloadParamsByKind.csls` (kind registry entries indexed by `K extends WorkloadKind`: scanner false positives).
- Left for the owner, 11 rows: `EffectiveAppConfig.importSkipCharacters`; `GlobalSettingView` key, value and updatedAt; the sole-field results `PruneUnusedResult.removed`, `RemoveResult.deleted`, `DetachResult.detached`, `ReorderResult.reordered`, `workloadScheduleRefSchema.id`, `DeferredResult.deferred`; `importStWorkloadParams.dryRun`.
- Rows in the table and absent from the fresh run: the client stats surfaces now read the `OwnerStatsView`, `ModelStatRow` and `LeaderboardRow` fields the old run listed, and `import-character.ts:79` reads `LinkCarriedBooksResult.linked`. The other absent rows (seeds keys, `BookAttachmentView.role`, `bookAttachmentTargetsSchema`, `MaintenanceResult.mergedKeys`, `BundleImportWorkloadResult.memoryScope`, `databankReindexWorkloadParams.embedderChanged`, `WorkloadEventBase.kind`, `WorkloadPoisonRow`, `LoreConstantCanonRow`) are no longer reported; each was left unchanged and not re-read individually.

Ran: `pnpm typecheck` for contracts, server, client, `tsconfig.node.json`, tests-iso, tests-dom and tooling; `pnpm test` over the touched suites and `tests/server/domain/{settings,stats,tag,workloads,tool-use,import}`, `tests/server/transport`, `tests/contracts`, the corpus suites under `tests/support/node`; `pnpm lint:eslint` on the touched files; `pnpm depcruise`; `pnpm knip`; `pnpm test:tools tests/tooling/unwired`. The corpus fixture `corpus.json` is republished and formatted; `db` and `assets` are unchanged.
