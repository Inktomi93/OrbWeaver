---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the contracts fields the unwired fields scan reports: refinery to session

## What

`pnpm unwired fields` reports each of the fields below in `contracts`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `refineryCustomRunConfigSchema.schemaId` | `contracts/src/refinery/index.ts:291` | never-read | delete | delete the key and its writes (`server/src/domain/refinery/substrate/stage-resolution.ts:68`) |
| `refineryCustomRunConfigSchema.schemaVersion` | `contracts/src/refinery/index.ts:292` | never-read | delete | delete the key and its writes (`server/src/domain/refinery/substrate/stage-resolution.ts:68`) |
| `refineryFieldScoreSchema.strengths` | `contracts/src/refinery/index.ts:326` | unreferenced | delete | delete the key and the 1 test reference |
| `refineryScorePayloadSchema.summary` | `contracts/src/refinery/index.ts:335` | unreferenced | delete | delete the key and the 5 test references |
| `refineryRewriteFieldSchema.append` | `contracts/src/refinery/index.ts:381` | unreferenced | delete | delete the key and the 1 test reference |
| `refineryRewriteFieldSchema.cleared` | `contracts/src/refinery/index.ts:383` | never-read | delete | delete the key and its writes (`client/src/features/refinery/components/manual-rewrite-dialog.tsx:78`) and the 2 test references |
| `RefineryStagePayloadByStage.score` | `contracts/src/refinery/index.ts:454` | unreferenced | delete | delete the field |
| `RefineryStagePayloadByStage.rewrite` | `contracts/src/refinery/index.ts:455` | unreferenced | delete | delete the field |
| `RefineryStagePayloadByStage.analyze` | `contracts/src/refinery/index.ts:456` | unreferenced | delete | delete the field |
| `refineryRunBaseSchema.sessionId` | `contracts/src/refinery/index.ts:525` | unreferenced | delete | delete the key and the 4 test references |
| `IterateResult.iterationCount` | `contracts/src/refinery/index.ts:631` | never-read | delete | delete the field and its writes (`server/src/domain/refinery/verbs/iterate.ts:80`) and the 1 test reference |
| `StagePreflight.model` | `contracts/src/refinery/index.ts:639` | unreferenced | delete | delete the field |
| `StagePreflight.temperature` | `contracts/src/refinery/index.ts:640` | unreferenced | delete | delete the field |
| `schemaForgeResultSchema.kind` | `contracts/src/refinery/index.ts:714` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `schemaForgeResultSchema.name` | `contracts/src/refinery/index.ts:714` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `schemaForgeResultSchema.schema` | `contracts/src/refinery/index.ts:714` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `schemaForgeResultSchema.dropped` | `contracts/src/refinery/index.ts:714` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `schemaForgeResultSchema.message` | `contracts/src/refinery/index.ts:715` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `schemaForgeResultSchema.skeleton` | `contracts/src/refinery/index.ts:715` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `schemaForgeResultSchema.raw` | `contracts/src/refinery/index.ts:716` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `RefinerySessionView.updatedAt` | `contracts/src/refinery/index.ts:741` | never-read | delete | delete the field and its writes (`server/src/domain/refinery/persistence/queries.ts:263`) and the 3 test references |
| `RefineryFieldRef.field` | `contracts/src/refinery/index.ts:796` | unreferenced | delete | delete the field |
| `RefineryFieldRef.greetingIndex` | `contracts/src/refinery/index.ts:797` | unreferenced | delete | delete the field |
| `RefineryFieldRef.appendIndex` | `contracts/src/refinery/index.ts:798` | unreferenced | delete | delete the field |
| `ApplyFieldsResult.character` | `contracts/src/refinery/index.ts:813` | never-read | delete | delete the field and its writes (`server/src/domain/refinery/verbs/apply-fields.ts:83`) and the 5 test references |
| `ApplyAsCopyResult.applied` | `contracts/src/refinery/index.ts:824` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ApplyAsCopyResult.dropped` | `contracts/src/refinery/index.ts:825` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ApplyAsCopyResult.character` | `contracts/src/refinery/index.ts:826` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `RefinerySchemaStats.anyOfVariants` | `contracts/src/refinery/schema-advisory.ts:27` | never-read | delete | delete the field and its writes (`contracts/src/refinery/schema-advisory.ts:188`) |
| `renderHintSchema.group` | `contracts/src/refinery/schema-authoring.ts:77` | unreferenced | delete | delete the key |
| `renderHintSchema.chart` | `contracts/src/refinery/schema-authoring.ts:79` | unreferenced | delete | delete the key |
| `refinerySchemaSummarySchema.stage` | `contracts/src/refinery/schema-authoring.ts:245` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `refinerySchemaSummarySchema.version` | `contracts/src/refinery/schema-authoring.ts:246` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `refinerySchemaSummarySchema.createdAt` | `contracts/src/refinery/schema-authoring.ts:248` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `refinerySchemaSummarySchema.updatedAt` | `contracts/src/refinery/schema-authoring.ts:249` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `forgeFieldRowSchema.enum` | `contracts/src/refinery/schema-forge.ts:124` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `contracts/src/refinery/schema-forge.ts:271` |
| `forgeFieldRowSchema.minimum` | `contracts/src/refinery/schema-forge.ts:125` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `contracts/src/refinery/schema-forge.ts:153` |
| `forgeFieldRowSchema.maximum` | `contracts/src/refinery/schema-forge.ts:126` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `contracts/src/refinery/schema-forge.ts:153` |
| `forgeFieldRowSchema.maxLength` | `contracts/src/refinery/schema-forge.ts:127` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `contracts/src/refinery/schema-forge.ts:273` |
| `forgeDesignEnvelopeSchema.needsRaw` | `contracts/src/refinery/schema-forge.ts:174` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/refinery/substrate/schema-forge.ts:203` |
| `forgeDesignEnvelopeSchema.needsRawReason` | `contracts/src/refinery/schema-forge.ts:176` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/refinery/substrate/schema-forge.ts:208` |
| `forgeFieldEnvelopeSchema.field` | `contracts/src/refinery/schema-forge.ts:196` | unreferenced | delete | delete the key |
| `forgeHintRowSchema.tones.member` | `contracts/src/refinery/schema-forge.ts:208` | unreferenced | delete | delete the key |
| `forgeHintRowSchema.tones.tone` | `contracts/src/refinery/schema-forge.ts:208` | unreferenced | delete | delete the key |
| `regexScriptUsageSchema.presets.id` | `contracts/src/regex/schemas.ts:398` | unreferenced | delete | delete the key |
| `regexScriptUsageSchema.presets.name` | `contracts/src/regex/schemas.ts:398` | unreferenced | delete | delete the key |
| `regexScriptUsageSchema.characters.id` | `contracts/src/regex/schemas.ts:399` | unreferenced | delete | delete the key |
| `regexScriptUsageSchema.characters.name` | `contracts/src/regex/schemas.ts:399` | unreferenced | delete | delete the key |
| `RemoveResult.deleted` | `contracts/src/regex/schemas.ts:415` | never-read | delete | delete the field and its writes (`server/src/domain/regex/verbs/scripts/remove.ts:38`) |
| `DetachResult.detached` | `contracts/src/regex/schemas.ts:421` | never-read | delete | delete the field and its writes (`server/src/domain/regex/verbs/attachments/detach-from-character.ts:32`) |
| `ReorderResult.reordered` | `contracts/src/regex/schemas.ts:426` | never-read | delete | delete the field and its writes (`server/src/domain/regex/verbs/attachments/apply-scope-order.ts:98`) |
| `responseFormatSchema.schema` | `contracts/src/role-clients/index.ts:35` | unreferenced | delete | delete the key |
| `SummarizeInput.images` | `contracts/src/role-clients/index.ts:88` | never-read | delete | delete the field and its writes (`server/src/domain/imagery/verbs/caption-image.ts:10`) |
| `StructuredOptions.responseFormat` | `contracts/src/role-clients/index.ts:100` | never-read | delete | delete the field and its writes (`server/src/domain/discovery/verbs/analyze.ts:56`) |
| `ResolvedTaskView.connectionId` | `contracts/src/role-clients/index.ts:112` | unreferenced | delete | delete the field |
| `ResolvedTaskView.providerId` | `contracts/src/role-clients/index.ts:113` | unreferenced | delete | delete the field |
| `RosterPresetView.createdAt` | `contracts/src/roster-preset/index.ts:130` | never-read | delete | delete the field and its writes (`server/src/domain/roster-preset/persistence/queries.ts:206`) and the 1 test reference |
| `RosterPresetSummary.updatedAt` | `contracts/src/roster-preset/index.ts:151` | never-read | delete | delete the field and its writes (`server/src/domain/roster-preset/persistence/queries.ts:223`) |
| `ApplyRosterPresetResult.configApplied` | `contracts/src/roster-preset/index.ts:176` | never-read | delete | delete the field and its writes (`server/src/domain/roster-preset/verbs/apply-to-chat.ts:229`) and the 1 test reference |
| `subscriptionErrorFrameSchema.__subscriptionError` | `contracts/src/rpc/index.ts:13` | never-read | delete | delete the key and its writes (`server/src/transport/trpc/subscriptions.ts:51`) and the 1 test reference |
| `rpgWeatherSchema.temperatureC` | `contracts/src/rpg/ambient.ts:71` | unreferenced | delete | delete the key |
| `rpgWeatherSchema.description` | `contracts/src/rpg/ambient.ts:72` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/rpg/substrate/reminder.ts:112` |
| `rpgWeatherSchema.wind` | `contracts/src/rpg/ambient.ts:73` | unreferenced | delete | delete the key |
| `rpgWeatherSchema.visibility` | `contracts/src/rpg/ambient.ts:74` | unreferenced | delete | delete the key |
| `ExtractionPromptContext.refs` | `contracts/src/rpg/extraction-prompt.ts:57` | never-read | delete | delete the field and its writes (`contracts/src/rpg/extraction-prompt.ts:347`) |
| `ExtractionPlanePrompt.toolName` | `contracts/src/rpg/extraction-prompt.ts:83` | never-read | delete | delete the field and its writes (`contracts/src/rpg/extraction-prompt.ts:132`) |
| `RpgExtractionDrop.index` | `contracts/src/rpg/extraction.ts:580` | never-read | delete | delete the field and its writes (`contracts/src/rpg/extraction.ts:624`) |
| `RpgExtractionDrop.issues` | `contracts/src/rpg/extraction.ts:581` | never-read | delete | delete the field and its writes (`contracts/src/rpg/extraction.ts:624`) |
| `rpgPopulateSchema.sheet` | `contracts/src/rpg/extraction.ts:716` | unreferenced | delete | delete the key |
| `rpgPopulateSchema.inventory` | `contracts/src/rpg/extraction.ts:717` | unreferenced | delete | delete the key |
| `rpgPopulateSchema.quests` | `contracts/src/rpg/extraction.ts:718` | unreferenced | delete | delete the key |
| `rpgUpdateConfigInputSchema.patch.statProfile` | `contracts/src/rpg/inputs.ts:58` | never-read | delete | delete the key and its writes (`client/src/features/rpg/components/rpg-stat-profile-editor.tsx:153`) and the 1 test reference |
| `rpgUpdateConfigInputSchema.patch.ruleset` | `contracts/src/rpg/inputs.ts:63` | never-read | delete | delete the key and its writes (`client/src/features/rpg/components/rpg-ruleset-control.tsx:48`) and the 1 test reference |
| `rpgUpdateConfigInputSchema.patch.steeringNote` | `contracts/src/rpg/inputs.ts:64` | unreferenced | delete | delete the key and the 2 test references |
| `rpgUpdateConfigInputSchema.patch.trackers` | `contracts/src/rpg/inputs.ts:69` | never-read | delete | delete the key and its writes (`client/src/features/rpg/components/rpg-game-tab.tsx:197`) and the 6 test references |
| `rpgUpdateConfigInputSchema.patch.relationshipHints` | `contracts/src/rpg/inputs.ts:72` | never-read | delete | delete the key and its writes (`client/src/features/rpg/components/rpg-game-tab.tsx:278`) and the 1 test reference |
| `rpgUpdateConfigInputSchema.patch.journalTypeHints` | `contracts/src/rpg/inputs.ts:73` | never-read | delete | delete the key and its writes (`client/src/features/rpg/components/rpg-game-tab.tsx:294`) |
| `rpgUpdateConfigInputSchema.patch.deception` | `contracts/src/rpg/inputs.ts:77` | unreferenced | delete | delete the key and the 4 test references |
| `rpgUpdateConfigInputSchema.patch.omniscience` | `contracts/src/rpg/inputs.ts:78` | unreferenced | delete | delete the key |
| `rpgUpdateConfigInputSchema.patch.hiddenContentReveal` | `contracts/src/rpg/inputs.ts:79` | unreferenced | delete | delete the key and the 5 test references |
| `rpgUpdateConfigInputSchema.patch.recentBeatsKeepLast` | `contracts/src/rpg/inputs.ts:80` | unreferenced | delete | delete the key |
| `rpgUpdateConfigInputSchema.patch.immersiveHtml` | `contracts/src/rpg/inputs.ts:82` | unreferenced | delete | delete the key |
| `rpgUpdateConfigInputSchema.patch.immersiveHtmlInteractive` | `contracts/src/rpg/inputs.ts:83` | unreferenced | delete | delete the key |
| `rpgUpdateConfigInputSchema.patch.cardKeepLastX` | `contracts/src/rpg/inputs.ts:84` | unreferenced | delete | delete the key |
| `rpgUpdateConfigInputSchema.patch.cyoa` | `contracts/src/rpg/inputs.ts:87` | unreferenced | delete | delete the key and the 1 test reference |
| `rpgUpdateConfigInputSchema.patch.cyoaChoiceBehavior` | `contracts/src/rpg/inputs.ts:88` | unreferenced | delete | delete the key |
| `rpgUpdateConfigInputSchema.patch.plotProgression` | `contracts/src/rpg/inputs.ts:89` | unreferenced | delete | delete the key |
| `rpgUpdateConfigInputSchema.patch.engaged` | `contracts/src/rpg/inputs.ts:92` | never-read | delete | delete the key and its writes (`client/src/features/chat/components/chat-options-menu.tsx:97`) |
| `rpgUpdateConfigInputSchema.patch.dateMode` | `contracts/src/rpg/inputs.ts:94` | unreferenced | delete | delete the key and the 1 test reference |
| `rpgUpdateConfigInputSchema.patch.extractionContext` | `contracts/src/rpg/inputs.ts:97` | unreferenced | delete | delete the key |
| `rpgUpdateConfigInputSchema.patch.stateCaptureVehicle` | `contracts/src/rpg/inputs.ts:99` | unreferenced | delete | delete the key and the 2 test references |
| `rpgUpdateConfigInputSchema.patch.extractionWindowTokens` | `contracts/src/rpg/inputs.ts:100` | unreferenced | delete | delete the key |
| `rpgUpdateConfigInputSchema.patch.reconcileEveryBeats` | `contracts/src/rpg/inputs.ts:101` | unreferenced | delete | delete the key |
| `rpgUpdateConfigInputSchema.patch.userMacros` | `contracts/src/rpg/inputs.ts:105` | never-read | delete | delete the key and its writes (`client/src/features/rpg/components/rpg-game-macros.tsx:57`) |
| `rpgPatchSheetInputSchema.patch.trackerGrants` | `contracts/src/rpg/inputs.ts:133` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `client/src/features/rpg/hooks/use-rpg-mutations.ts:125` |
| `rpgPatchSheetInputSchema.patch.trackerRevokes` | `contracts/src/rpg/inputs.ts:134` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `client/src/features/rpg/hooks/use-rpg-mutations.ts:125` |
| `rpgUpsertQuestInputSchema.objectives.text` | `contracts/src/rpg/inputs.ts:230` | unreferenced | delete | delete the key and the 3 test references |
| `rpgUpsertQuestInputSchema.objectives.completed` | `contracts/src/rpg/inputs.ts:230` | unreferenced | delete | delete the key and the 2 test references |
| `rpgEditQuestObjectiveInputSchema.op.kind` | `contracts/src/rpg/inputs.ts:240` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `rpgEditQuestObjectiveInputSchema.op.text` | `contracts/src/rpg/inputs.ts:240` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `rpgEditQuestObjectiveInputSchema.op.objectiveId` | `contracts/src/rpg/inputs.ts:243` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `rpgEditQuestObjectiveInputSchema.op.completed` | `contracts/src/rpg/inputs.ts:244` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `rpgAddJournalEntryInputSchema.label` | `contracts/src/rpg/inputs.ts:261` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/rpg/verbs/journal/add-journal-entry.ts:21` |
| `rpgEditJournalEntryInputSchema.patch.type` | `contracts/src/rpg/inputs.ts:271` | unreferenced | delete | delete the key and the 5 test references |
| `rpgEditJournalEntryInputSchema.patch.label` | `contracts/src/rpg/inputs.ts:272` | unreferenced | delete | delete the key and the 7 test references |
| `rpgEditJournalEntryInputSchema.patch.title` | `contracts/src/rpg/inputs.ts:273` | never-read | delete | delete the key and its writes (`client/src/features/rpg/components/rpg-journal-tab.tsx:136`) |
| `rpgEditJournalEntryInputSchema.patch.content` | `contracts/src/rpg/inputs.ts:274` | never-read | delete | delete the key and its writes (`client/src/features/rpg/components/rpg-journal-tab.tsx:140`) and the 3 test references |
| `rpgStatResolutionSchema.kind` | `contracts/src/rpg/profile.ts:23` | never-read | delete | delete the key and its writes (`contracts/src/rpg/profile.ts:81`) |
| `CreateGameResult.gameId` | `contracts/src/rpg/results.ts:11` | never-read | delete | delete the field and its writes (`server/src/domain/rpg/verbs/game/create-game.ts:49`) and the 7 test references |
| `CreateGameResult.trackersReadOnly` | `contracts/src/rpg/results.ts:12` | never-read | delete | delete the field and its writes (`server/src/domain/rpg/verbs/game/create-game.ts:49`) |
| `RollDiceResult.notation` | `contracts/src/rpg/results.ts:68` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `RollDiceResult.modifier` | `contracts/src/rpg/results.ts:70` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `RollDiceResult.total` | `contracts/src/rpg/results.ts:71` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `promoteActorResultSchema.ok` | `contracts/src/rpg/results.ts:93` | never-read | delete | delete the key and its writes (`server/src/domain/rpg/verbs/promote-actor.ts:56`) |
| `promoteActorResultSchema.issues` | `contracts/src/rpg/results.ts:93` | never-read | delete | delete the key and its writes (`server/src/domain/rpg/verbs/promote-actor.ts:115`) |
| `PatchValueEntry.plane` | `contracts/src/rpg/structured-patch.ts:195` | unreferenced | delete | delete the field and the 3 test references |
| `PatchValueEntry.call` | `contracts/src/rpg/structured-patch.ts:196` | unreferenced | delete | delete the field and the 3 test references |
| `PatchValueEntry.field` | `contracts/src/rpg/structured-patch.ts:197` | unreferenced | delete | delete the field and the 4 test references |
| `PatchValueEntry.item` | `contracts/src/rpg/structured-patch.ts:198` | unreferenced | delete | delete the field and the 3 test references |
| `PatchValueEntry.value` | `contracts/src/rpg/structured-patch.ts:199` | unreferenced | delete | delete the field and the 4 test references |
| `PatchNoChangesEntry.plane` | `contracts/src/rpg/structured-patch.ts:203` | unreferenced | delete | delete the field |
| `PatchReply.changes` | `contracts/src/rpg/structured-patch.ts:207` | unreferenced | delete | delete the field |
| `trackerDeltaSchema.key` | `contracts/src/rpg/tools.ts:65` | unreferenced | delete | delete the key and the 1 test reference |
| `trackerDeltaSchema.delta` | `contracts/src/rpg/tools.ts:65` | unreferenced | delete | delete the key and the 1 test reference |
| `trackerSetSchema.key` | `contracts/src/rpg/tools.ts:72` | unreferenced | delete | delete the key and the 1 test reference |
| `trackerSetSchema.value` | `contracts/src/rpg/tools.ts:73` | unreferenced | delete | delete the key and the 1 test reference |
| `trackerSetSchema.items` | `contracts/src/rpg/tools.ts:74` | unreferenced | delete | delete the key and the 1 test reference |
| `updateInventoryArgsSchema.remove.name` | `contracts/src/rpg/tools.ts:140` | unreferenced | delete | delete the key and the 1 test reference |
| `updateInventoryArgsSchema.remove.quantity` | `contracts/src/rpg/tools.ts:140` | unreferenced | delete | delete the key and the 1 test reference |
| `updateInventoryArgsSchema.walletDeltas.name` | `contracts/src/rpg/tools.ts:141` | unreferenced | delete | delete the key and the 1 test reference |
| `updateInventoryArgsSchema.walletDeltas.delta` | `contracts/src/rpg/tools.ts:141` | unreferenced | delete | delete the key and the 1 test reference |
| `rpgTraceEventSchema.phase` | `contracts/src/rpg/trace.ts:30` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `rpgTraceEventSchema.toolNames` | `contracts/src/rpg/trace.ts:30` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `rpgTraceEventSchema.calls` | `contracts/src/rpg/trace.ts:35` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `rpgTraceEventSchema.vehicle` | `contracts/src/rpg/trace.ts:36` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `rpgTraceEventSchema.path` | `contracts/src/rpg/trace.ts:42` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `rpgTraceEventSchema.fallbackReason` | `contracts/src/rpg/trace.ts:43` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `rpgTraceEventSchema.outcome` | `contracts/src/rpg/trace.ts:49` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `rpgTraceEventSchema.droppedReason` | `contracts/src/rpg/trace.ts:50` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `rpgTraceEventSchema.type` | `contracts/src/rpg/trace.ts:52` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `rpgTraceRecordSchema.seq` | `contracts/src/rpg/trace.ts:57` | never-read | delete | delete the key and its writes (`server/src/domain/rpg/trace.ts:43`) and the 3 test references |
| `rpgTraceRecordSchema.at` | `contracts/src/rpg/trace.ts:57` | never-read | delete | delete the key and its writes (`server/src/domain/rpg/trace.ts:43`) |
| `rpgTrackerDefSchema.icon` | `contracts/src/rpg/tracker.ts:77` | never-read | delete | delete the key and its writes (`contracts/src/rpg/profile.ts:155`) and the 1 test reference |
| `RpgGameView.chatId` | `contracts/src/rpg/views.ts:64` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `RpgGameView.mode` | `contracts/src/rpg/views.ts:65` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `RpgGameView.status` | `contracts/src/rpg/views.ts:66` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `RpgGameView.trackersReadOnly` | `contracts/src/rpg/views.ts:68` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `RpgGameView.extractionMode` | `contracts/src/rpg/views.ts:79` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `RpgGameView.publicConfig.plotProgression` | `contracts/src/rpg/views.ts:103` | never-read | delete | delete the field and its writes (`server/src/domain/rpg/verbs/read/get-game.ts:47`) |
| `RpgTurnToolCallsView.messageId` | `contracts/src/rpg/views.ts:274` | unreferenced | delete | delete the field and the 2 test references |
| `RpgTurnToolCallsView.createdAt` | `contracts/src/rpg/views.ts:282` | unreferenced | delete | delete the field |
| `RpgRevealedSpan.revealLabel` | `contracts/src/rpg/views.ts:343` | never-read | delete | delete the field and its writes (`server/src/domain/rpg/substrate/reveal.ts:27`) |
| `RpgRevealView.messages` | `contracts/src/rpg/views.ts:370` | never-read | delete | delete the field and its writes (`server/src/domain/rpg/substrate/reveal.ts:97`) and the 3 test references |
| `rpgEffectiveDeliverySchema.stateRoundOverflow.connectionId` | `contracts/src/rpg/views.ts:399` | unreferenced | delete | delete the key |
| `rpgEffectiveDeliverySchema.stateRoundOverflow.windowTokens` | `contracts/src/rpg/views.ts:399` | unreferenced | delete | delete the key |
| `rpgGameViewSchema.publicConfig.dateMode` | `contracts/src/rpg/views.ts:413` | unreferenced | delete | delete the key |
| `rpgGameViewSchema.publicConfig.cyoa` | `contracts/src/rpg/views.ts:415` | unreferenced | delete | delete the key |
| `rpgQuestViewSchema.objectives.id` | `contracts/src/rpg/views.ts:441` | unreferenced | delete | delete the key and the 3 test references |
| `rpgQuestViewSchema.objectives.text` | `contracts/src/rpg/views.ts:441` | unreferenced | delete | delete the key |
| `rpgQuestViewSchema.objectives.completed` | `contracts/src/rpg/views.ts:441` | unreferenced | delete | delete the key and the 1 test reference |
| `rpgTrackerViewSchema.ambient.location` | `contracts/src/rpg/views.ts:453` | unreferenced | delete | delete the key and the 17 test references |
| `rpgTrackerViewSchema.ambient.calendarDate` | `contracts/src/rpg/views.ts:454` | unreferenced | delete | delete the key and the 1 test reference |
| `rpgTrackerViewSchema.ambient.clock` | `contracts/src/rpg/views.ts:455` | unreferenced | delete | delete the key |
| `rpgTrackerViewSchema.ambient.weather` | `contracts/src/rpg/views.ts:456` | unreferenced | delete | delete the key and the 2 test references |
| `rpgRevealedSpanSchema.fields.key` | `contracts/src/rpg/views.ts:514` | unreferenced | delete | delete the key and the 1 test reference |
| `rpgRevealedSpanSchema.fields.value` | `contracts/src/rpg/views.ts:514` | unreferenced | delete | delete the key and the 1 test reference |
| `rpgRevealViewSchema.standingLies.character` | `contracts/src/rpg/views.ts:529` | unreferenced | delete | delete the key and the 2 test references |
| `RpgCheckpointView.gameId` | `contracts/src/rpg/views.ts:534` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `RpgCheckpointView.snapshotId` | `contracts/src/rpg/views.ts:535` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `RpgCheckpointView.trigger` | `contracts/src/rpg/views.ts:537` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `DiscoverSegment.blockIdx` | `contracts/src/search/index.ts:130` | never-read | delete | delete the field and its writes (`server/src/domain/search/verbs/discover.ts:51`) |
| `DiscoverSegment.score` | `contracts/src/search/index.ts:132` | never-read | delete | delete the field and its writes (`server/src/domain/search/verbs/discover.ts:53`) |
| `ImageSearchHit.score` | `contracts/src/search/index.ts:147` | unreferenced | delete | delete the field and the 1 test reference |
| `SegmentSearchHit.blockKey` | `contracts/src/search/index.ts:175` | unreferenced | delete | delete the field and the 6 test references |
| `SegmentSearchHit.score` | `contracts/src/search/index.ts:176` | unreferenced | delete | delete the field |
| `SegmentSearchHit.text` | `contracts/src/search/index.ts:177` | unreferenced | delete | delete the field and the 2 test references |
| `CorpusHit.source` | `contracts/src/search/index.ts:182` | unreferenced | delete | delete the field and the 5 test references |
| `CorpusHit.chatTitle` | `contracts/src/search/index.ts:185` | unreferenced | delete | delete the field |
| `CorpusHit.relevance` | `contracts/src/search/index.ts:186` | unreferenced | delete | delete the field |
| `CorpusHit.score` | `contracts/src/search/index.ts:187` | unreferenced | delete | delete the field |
| `CorpusHit.text` | `contracts/src/search/index.ts:188` | unreferenced | delete | delete the field and the 1 test reference |
| `FieldSearchResult.coverage.requestLimit` | `contracts/src/search/index.ts:203` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `FieldSearchResult.coverage.indexedCharacters` | `contracts/src/search/index.ts:204` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `FieldSearchResult.coverage.matchingCharacters` | `contracts/src/search/index.ts:205` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `SearchSuggestion.score` | `contracts/src/search/index.ts:211` | unreferenced | delete | delete the field |
| `DiscoverCharacter.score` | `contracts/src/search/index.ts:217` | never-read | delete | delete the field and its writes (`server/src/domain/search/verbs/discover.ts:62`) |
| `DiscoverCharacter.relevance` | `contracts/src/search/index.ts:218` | never-read | delete | delete the field and its writes (`server/src/domain/search/verbs/discover.ts:65`) |
| `DiscoverCharacter.name` | `contracts/src/search/index.ts:219` | never-read | delete | delete the field and its writes (`server/src/domain/search/verbs/discover.ts:66`) |
| `DiscoverCharacter.avatarHash` | `contracts/src/search/index.ts:220` | never-read | delete | delete the field and its writes (`server/src/domain/search/verbs/discover.ts:67`) |
| `DiscoverCharacter.genre` | `contracts/src/search/index.ts:221` | never-read | delete | delete the field and its writes (`server/src/domain/search/verbs/discover.ts:68`) |
| `DiscoverCharacter.tone` | `contracts/src/search/index.ts:222` | never-read | delete | delete the field and its writes (`server/src/domain/search/verbs/discover.ts:69`) |
| `DiscoverCharacter.elevatorPitch` | `contracts/src/search/index.ts:223` | never-read | delete | delete the field and its writes (`server/src/domain/search/verbs/discover.ts:70`) |
| `DiscoverCharacter.segments` | `contracts/src/search/index.ts:225` | unreferenced | delete | delete the field and the 2 test references |
| `SimilarArtHit.characterId` | `contracts/src/search/index.ts:236` | unreferenced | delete | delete the field |
| `SimilarArtHit.score` | `contracts/src/search/index.ts:237` | unreferenced | delete | delete the field |
| `SimilarArtHit.relevance` | `contracts/src/search/index.ts:238` | unreferenced | delete | delete the field |
| `SimilarArtHit.name` | `contracts/src/search/index.ts:239` | unreferenced | delete | delete the field |
| `SimilarArtHit.avatarHash` | `contracts/src/search/index.ts:240` | unreferenced | delete | delete the field |
| `SimilarArtHit.lens` | `contracts/src/search/index.ts:241` | unreferenced | delete | delete the field |
| `DocumentChunkHit.contentHash` | `contracts/src/search/index.ts:266` | never-read | delete | delete the field and its writes (`server/src/domain/search/verbs/documents.ts:63`) |
| `searchScopeInputSchema.scopedCharacterId` | `contracts/src/search/index.ts:490` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/search/verbs/search.ts:145` |
| `unifiedSearchInputSchema.rerank` | `contracts/src/search/index.ts:505` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/transport/trpc/routers/search.ts:67` |
| `SessionView.createdAt` | `contracts/src/session/index.ts:14` | unreferenced | delete | delete the field |
| `SessionAdminView.userId` | `contracts/src/session/index.ts:23` | unreferenced | delete | delete the field |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
