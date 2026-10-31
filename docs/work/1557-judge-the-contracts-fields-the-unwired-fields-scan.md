---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the contracts fields the unwired fields scan reports: chat to diagnostics

## What

`pnpm unwired fields` reports each of the fields below in `contracts`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `chatInjectionInputSchema.order` | `contracts/src/chat/assemble.ts:152` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/chat/verbs/chat-lifecycle.ts:592` |
| `MemoryRecallCandidate.score` | `contracts/src/chat/assemble.ts:188` | unreferenced | delete | delete the field and the 1 test reference |
| `MemoryRecallCandidate.relevance` | `contracts/src/chat/assemble.ts:191` | never-written | delete | delete the field and the branch that reads its default at `client/src/features/chat/components/memory-recall-detail.tsx:111` |
| `MemoryRecallCandidate.rank` | `contracts/src/chat/assemble.ts:197` | never-written | delete | delete the field and the branch that reads its default at `client/src/features/chat/components/memory-recall-detail.tsx:98` |
| `MemoryRecallSlice.ms` | `contracts/src/chat/assemble.ts:227` | never-read | delete | delete the field and its writes (`server/src/domain/chat/memory/recall/recall.ts:183`) and the 1 test reference |
| `ContextFitPreview.droppedCount` | `contracts/src/chat/assemble.ts:495` | unreferenced | delete | delete the field and the 5 test references |
| `ContextFitUnbound.unbound` | `contracts/src/chat/assemble.ts:507` | never-read | delete | delete the field and its writes (`server/src/domain/chat/verbs/read.ts:1564`) and the 1 test reference |
| `sentPromptSchema.afterHistory.position` | `contracts/src/chat/assemble.ts:543` | unreferenced | delete | delete the key |
| `VariantWireView.variantId` | `contracts/src/chat/assemble.ts:578` | never-read | delete | delete the field and its writes (`server/src/domain/chat/persistence/queries.ts:1057`) and the 2 test references |
| `AssembleContext.recentMessages` | `contracts/src/chat/assemble.ts:662` | never-read | delete | delete the field and its writes (`server/src/domain/chat/assembly/context.ts:465`) |
| `AssembleContext.groupNudge` | `contracts/src/chat/assemble.ts:718` | unreferenced | delete | delete the field |
| `SectionPreview.rendered` | `contracts/src/chat/assemble.ts:750` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `SectionPreview.half` | `contracts/src/chat/assemble.ts:751` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `SectionPreview.trace` | `contracts/src/chat/assemble.ts:752` | never-read | delete (read) | the section preview never shows its trace: delete the field and its write in `assembly/assemble.ts` |
| `assembleTraceSchema.worldInfoDropped.id` | `contracts/src/chat/assemble.ts:793` | unreferenced | delete | delete the key |
| `assembleTraceSchema.worldInfoDropped.reason` | `contracts/src/chat/assemble.ts:793` | unreferenced | delete | delete the key |
| `assembleTraceSchema.worldInfoActivated.id` | `contracts/src/chat/assemble.ts:794` | unreferenced | delete | delete the key and the 1 test reference |
| `assembleTraceSchema.worldInfoActivated.title` | `contracts/src/chat/assemble.ts:794` | unreferenced | delete | delete the key |
| `assembleTraceSchema.worldInfoActivated.keys` | `contracts/src/chat/assemble.ts:794` | unreferenced | delete | delete the key |
| `assembleTraceSchema.matchedKeys.key` | `contracts/src/chat/assemble.ts:798` | unreferenced | delete | delete the key and the 3 test references |
| `assembleTraceSchema.matchedKeys.matchedLatestUserMessage` | `contracts/src/chat/assemble.ts:798` | unreferenced | delete | delete the key and the 1 test reference |
| `assembleTraceSchema.overrideSources.mainPrompt` | `contracts/src/chat/assemble.ts:809` | unreferenced | delete | delete the key |
| `assembleTraceSchema.overrideSources.postHistory` | `contracts/src/chat/assemble.ts:810` | unreferenced | delete | delete the key |
| `assembleTraceSchema.overrideSources.scenario` | `contracts/src/chat/assemble.ts:811` | unreferenced | delete | delete the key |
| `assembleTraceSchema.overrideSources.authorsNote` | `contracts/src/chat/assemble.ts:812` | unreferenced | delete | delete the key |
| `assembleTraceSchema.mergedFallbackTruncated.mainPrompt` | `contracts/src/chat/assemble.ts:816` | unreferenced | delete | delete the key |
| `assembleTraceSchema.mergedFallbackTruncated.postHistory` | `contracts/src/chat/assemble.ts:816` | unreferenced | delete | delete the key |
| `shapeTraceSchema.stageCounts.withTail` | `contracts/src/chat/assemble.ts:862` | unreferenced | delete | delete the key |
| `shapeTraceSchema.stageCounts.injected` | `contracts/src/chat/assemble.ts:862` | unreferenced | delete | delete the key |
| `shapeTraceSchema.stageCounts.squashed` | `contracts/src/chat/assemble.ts:862` | unreferenced | delete | delete the key |
| `shapeTraceSchema.stageCounts.named` | `contracts/src/chat/assemble.ts:862` | unreferenced | delete | delete the key and the 1 test reference |
| `memoryBackfillWorkloadParams.embedderChanged` | `contracts/src/chat/backfill.ts:43` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/chat/workload-contributions.ts:43` |
| `BulkImportChatsResult.written` | `contracts/src/chat/bulk-import.ts:247` | never-read | delete | delete the field and its writes (`server/src/domain/chat/persistence/import-write.ts:883`) |
| `TurnOrigin.initiator` | `contracts/src/chat/bus.ts:332` | never-read | delete | delete the field and its writes (`server/src/domain/chat/persistence/queries.ts:1237`) |
| `TurnOrigin.automationDepth` | `contracts/src/chat/bus.ts:334` | never-read | delete | delete the field and its writes (`server/src/domain/chat/persistence/queries.ts:1237`) |
| `cardFrameMintResponseSchema.expiresInMs` | `contracts/src/chat/card-frame.ts:116` | unreferenced | delete | delete the key |
| `cardFrameMintResponseSchema.granted` | `contracts/src/chat/card-frame.ts:126` | unreferenced | delete | delete the key and the 7 test references |
| `cardFrameMintResponseSchema.granted.externalMedia` | `contracts/src/chat/card-frame.ts:126` | unreferenced | delete | delete the key |
| `cardFrameMintResponseSchema.granted.inlineData` | `contracts/src/chat/card-frame.ts:126` | unreferenced | delete | delete the key |
| `cardFrameMintResponseSchema.granted.interactive` | `contracts/src/chat/card-frame.ts:126` | unreferenced | delete | delete the key and the 5 test references |
| `messageContentBlockSchema.dims.w` | `contracts/src/chat/content-blocks.ts:40` | unreferenced | delete | delete the key |
| `messageContentBlockSchema.dims.h` | `contracts/src/chat/content-blocks.ts:40` | unreferenced | delete | delete the key |
| `messageContentBlockSchema.css` | `contracts/src/chat/content-blocks.ts:45` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `client/src/features/chat/components/card-block.tsx:43` |
| `ContentClassPolicy.wire` | `contracts/src/chat/content-classes.ts:9` | never-read | delete | delete the field and its writes (`contracts/src/chat/content-classes.ts:23`) and the 5 test references |
| `ChatDetail.starred` | `contracts/src/chat/detail.ts:31` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ChatDetail.forkedAt` | `contracts/src/chat/detail.ts:39` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ChatDetail.opening` | `contracts/src/chat/detail.ts:117` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ChatDetail.compactSummary` | `contracts/src/chat/detail.ts:119` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ChatDetail.compactedAtSeq` | `contracts/src/chat/detail.ts:120` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ChatDetail.updatedAt` | `contracts/src/chat/detail.ts:122` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `HandoffCardCopy.minted` | `contracts/src/chat/handoff-context.ts:10` | never-read | delete | delete the field and its writes (`server/src/domain/character/persistence/handoff-copy-write.ts:187`) |
| `messageWindowSchema.anchorSeq` | `contracts/src/chat/message-pages.ts:63` | never-read | delete | delete the key and its writes (`server/src/domain/chat/verbs/message-window.ts:29`) |
| `messageWindowSchema.endMessageId` | `contracts/src/chat/message-pages.ts:65` | never-read | delete | delete the key and its writes (`server/src/domain/chat/verbs/message-window.ts:31`) |
| `ReasoningPartMeta.anthropic` | `contracts/src/chat/messages.ts:90` | never-written | delete | delete the field and the branch that reads its default at `inference/src/backends/v4/prompt.ts:104` |
| `chatReasoningPartSchema.meta.google` | `contracts/src/chat/messages.ts:112` | unreferenced | delete | delete the key |
| `chatReasoningPartSchema.meta.google.thoughtSignature` | `contracts/src/chat/messages.ts:112` | unreferenced | delete | delete the key |
| `chatReasoningPartSchema.meta.anthropic` | `contracts/src/chat/messages.ts:113` | unreferenced | delete | delete the key |
| `chatReasoningPartSchema.meta.anthropic.signature` | `contracts/src/chat/messages.ts:113` | unreferenced | delete | delete the key |
| `chatReasoningPartSchema.meta.anthropic.redactedData` | `contracts/src/chat/messages.ts:113` | unreferenced | delete | delete the key |
| `chatReasoningPartSchema.meta.openrouter.reasoningDetails` | `contracts/src/chat/messages.ts:114` | unreferenced | delete | delete the key |
| `namedProviderMetadataSchema.upstreamProvider` | `contracts/src/chat/messages.ts:164` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `namedProviderMetadataSchema.upstreamCost` | `contracts/src/chat/messages.ts:168` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `namedProviderMetadataSchema.cacheCreation5mTokens` | `contracts/src/chat/messages.ts:174` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `namedProviderMetadataSchema.cacheCreation1hTokens` | `contracts/src/chat/messages.ts:175` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `namedProviderMetadataSchema.webSearchRequests` | `contracts/src/chat/messages.ts:178` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `namedProviderMetadataSchema.warmSpareClaimed` | `contracts/src/chat/messages.ts:179` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `namedProviderMetadataSchema.durationApiMs` | `contracts/src/chat/messages.ts:180` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `namedProviderMetadataSchema.numTurns` | `contracts/src/chat/messages.ts:181` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `namedProviderMetadataSchema.sdkSessionId` | `contracts/src/chat/messages.ts:186` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `namedProviderMetadataSchema.servedModel` | `contracts/src/chat/messages.ts:187` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `namedProviderMetadataSchema.thinkingDropped` | `contracts/src/chat/messages.ts:198` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `pluginProviderMetadataSchema.raw` | `contracts/src/chat/messages.ts:214` | unreferenced | delete | delete the key |
| `groupConfigInputSchema.output` | `contracts/src/chat/metadata.ts:225` | unreferenced | delete | delete the key and the 1 test reference |
| `groupConfigInputSchema.policy` | `contracts/src/chat/metadata.ts:229` | unreferenced | delete | delete the key and the 1 test reference |
| `groupConfigInputSchema.cardScope` | `contracts/src/chat/metadata.ts:234` | unreferenced | delete | delete the key and the 1 test reference |
| `guidedSteerSchema.placement` | `contracts/src/chat/metadata.ts:278` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/chat/assembly/context.ts:600` |
| `ChatMetadata.databankVisibility` | `contracts/src/chat/metadata.ts:314` | never-read | delete | delete the field and its writes (`server/src/domain/chat/verbs/participants.ts:340`) |
| `nextTurnConnectionViewSchema.connectionLabel` | `contracts/src/chat/next-turn-connection.ts:24` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `nextTurnConnectionViewSchema.provider` | `contracts/src/chat/next-turn-connection.ts:25` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `nextTurnConnectionViewSchema.providerLabel` | `contracts/src/chat/next-turn-connection.ts:26` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `nextTurnConnectionViewSchema.model` | `contracts/src/chat/next-turn-connection.ts:27` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ViewerVisibility.role` | `contracts/src/chat/owner-ops.ts:57` | never-read | delete | delete the field and its writes (`server/src/domain/chat/verbs/resolve-viewer-visibility.ts:42`) |
| `MemoryDigestInput.lens` | `contracts/src/chat/owner-ops.ts:130` | never-read | delete | delete the field and its writes (`server/src/domain/chat/memory/generate/digests.ts:383`) |
| `StoreSegmentParams.lens` | `contracts/src/chat/owner-ops.ts:146` | never-read | delete | delete the field and its writes (`server/src/domain/chat/memory/generate/segments.ts:124`) and the 1 test reference |
| `SpeakerRef.kind` | `contracts/src/chat/participants.ts:36` | never-read | delete | delete the field and its writes (`server/src/domain/chat/assembly/context.ts:877`) |
| `MessageKindPolicy.reading` | `contracts/src/chat/participants.ts:129` | never-read | delete | delete the field and its writes (`contracts/src/chat/participants.ts:137`) |
| `ChatIdentityKindPolicy.macro` | `contracts/src/chat/producers.ts:81` | never-read | delete | delete the field and its writes (`contracts/src/chat/producers.ts:92`) |
| `MessageReactionGroup.emojiImageAssetId` | `contracts/src/chat/reactions.ts:81` | unreferenced | delete | delete the field |
| `RegexTierRowView.position` | `contracts/src/chat/regex-tiers.ts:115` | never-read | delete | delete the field and its writes (`server/src/domain/chat/substrate/regex-tier.ts:127`) |
| `EffectiveRegexEntry.scriptId` | `contracts/src/chat/regex-tiers.ts:152` | never-read | delete | delete the field and its writes (`server/src/domain/chat/substrate/regex-tier.ts:98`) |
| `EffectiveRegexEntry.runsAt` | `contracts/src/chat/regex-tiers.ts:154` | never-read | delete | delete the field and its writes (`server/src/domain/chat/substrate/regex-tier.ts:98`) |
| `characterMemberSpecSchema.kind` | `contracts/src/chat/roster.ts:96` | unreferenced | delete | delete the key |
| `ParticipantView.joinedAt` | `contracts/src/chat/roster.ts:276` | never-read | delete | delete the field and its writes (`server/src/domain/chat/verbs/load-participant-views.ts:74`) |
| `ParticipantView.joinSeq` | `contracts/src/chat/roster.ts:278` | never-read | delete | delete the field and its writes (`server/src/domain/chat/verbs/load-participant-views.ts:75`) and the 3 test references |
| `MemberCardView.avatarAssetId` | `contracts/src/chat/roster.ts:480` | never-read | delete | delete the field and its writes (`server/src/domain/chat/substrate/auth/clamp.ts:164`) and the 6 test references |
| `invitePreviewSchema.chatId` | `contracts/src/chat/roster.ts:654` | never-read | delete | delete the key and its writes (`server/src/domain/chat/verbs/invite-preview.ts:46`) and the 8 test references |
| `invitePreviewSchema.hostHandle` | `contracts/src/chat/roster.ts:656` | never-read | delete | delete the key and its writes (`server/src/domain/chat/verbs/invite-preview.ts:48`) and the 4 test references |
| `signupResultSchema.ok` | `contracts/src/chat/roster.ts:690` | unreferenced | delete | delete the key |
| `inviteViewSchema.chatId` | `contracts/src/chat/roster.ts:718` | never-read | delete | delete the key and its writes (`server/src/domain/chat/verbs/invites.ts:207`) and the 3 test references |
| `inviteViewSchema.createdAt` | `contracts/src/chat/roster.ts:727` | never-read | delete | delete the key and its writes (`server/src/domain/chat/verbs/invites.ts:214`) |
| `createInviteResultSchema.invite` | `contracts/src/chat/roster.ts:737` | never-read | delete | delete the key and its writes (`server/src/domain/chat/verbs/invites.ts:216`) and the 74 test references |
| `GatherTurnContextArgs.pendingUserText` | `contracts/src/chat/rpg-ops.ts:82` | never-read | delete | delete the field and its writes (`server/src/domain/chat/verbs/read.ts:650`) |
| `GatherTurnContextArgs.respondsToLatestUserTurn` | `contracts/src/chat/rpg-ops.ts:83` | never-read | delete | delete the field and its writes (`server/src/domain/chat/verbs/read.ts:651`) |
| `ForkGameResult.cloned` | `contracts/src/chat/rpg-ops.ts:119` | never-read | delete | delete the field and its writes (`server/src/domain/rpg/chat-ops/fork-game.ts:414`) |
| `TeachingContribution.id` | `contracts/src/chat/teaching.ts:56` | never-read | delete | delete the field and its writes (`server/src/domain/automation/teaching-contribution.ts:54`) |
| `ChatSeatPortrait.characterId` | `contracts/src/chat/views.ts:28` | never-read | delete | delete the field and its writes (`server/src/domain/chat/verbs/read.ts:334`) and the 2 test references |
| `ChatSummaryFields.viewerLastTurnAt` | `contracts/src/chat/views.ts:46` | never-read | delete | delete the field and its writes (`server/src/domain/chat/verbs/read.ts:346`) |
| `ChatSummaryFields.createdAt` | `contracts/src/chat/views.ts:80` | never-read | delete | delete the field and its writes (`server/src/domain/chat/verbs/read.ts:358`) |
| `ChatListPage.items` | `contracts/src/chat/views.ts:100` | unreferenced | wire (read) | `ChatListPageData` and the router's `chatListPageSchema` both override `items`: derive both from this member, or delete it from the wire type |
| `ChatLineageView.chain` | `contracts/src/chat/views.ts:113` | unreferenced | delete | delete the field |
| `ActionTemplatesPreview.identity.user` | `contracts/src/chat/views.ts:156` | never-read | delete | delete the field and its writes (`server/src/domain/chat/verbs/read.ts:1696`) and the 1 test reference |
| `ActionTemplatesPreview.identity.char` | `contracts/src/chat/views.ts:156` | never-read | delete | delete the field and its writes (`server/src/domain/chat/verbs/read.ts:1696`) |
| `ChatInjectionView.id` | `contracts/src/chat/views.ts:163` | never-read | delete | delete the field and its writes (`server/src/domain/chat/verbs/chat-lifecycle.ts:140`) |
| `StartChatResult.chat` | `contracts/src/chat/views.ts:233` | unreferenced | delete | delete the field and the 39 test references |
| `ReapResult.reaped` | `contracts/src/chat/views.ts:244` | never-read | delete | delete the field and its writes (`server/src/domain/chat/verbs/chat-lifecycle.ts:425`) |
| `actionTemplatesPreviewSchema.identity.char` | `contracts/src/chat/views.ts:305` | unreferenced | delete | delete the key and the 1 test reference |
| `credentialHealthSchema.checkedAt` | `contracts/src/credentials/index.ts:54` | never-read | delete | delete the key and its writes (`inference/src/backends/anthropic-messages/index.ts:87`) and the 1 test reference |
| `credentialViewSchema.revokedReason` | `contracts/src/credentials/index.ts:114` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `credentialViewSchema.createdAt` | `contracts/src/credentials/index.ts:115` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `credentialViewSchema.updatedAt` | `contracts/src/credentials/index.ts:116` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `chunkParamsSchema.chunkSize` | `contracts/src/databank/index.ts:138` | unreferenced | delete | delete the key and the 1 test reference |
| `chunkParamsSchema.overlapPercent` | `contracts/src/databank/index.ts:139` | unreferenced | delete | delete the key |
| `chunkParamsSchema.wholeFileThreshold` | `contracts/src/databank/index.ts:140` | unreferenced | delete | delete the key |
| `databankSettingsSchema.retrieval` | `contracts/src/databank/index.ts:164` | never-read | delete | delete the key and its writes (`server/src/domain/settings/verbs/get-databank-settings.ts:7`) and the 2 test references |
| `ActiveChatDocumentView.hidden` | `contracts/src/databank/index.ts:351` | unreferenced | delete | delete the field and the 1 test reference |
| `ActiveChatDocumentView.sources` | `contracts/src/databank/index.ts:357` | unreferenced | delete | delete the field and the 1 test reference |
| `ReindexResult.workloadId` | `contracts/src/databank/index.ts:386` | unreferenced | delete | delete the field and the 4 test references |
| `ingestRunResultSchema.failed.documentId` | `contracts/src/databank/index.ts:444` | unreferenced | delete | delete the key |
| `ingestRunResultSchema.failed.error` | `contracts/src/databank/index.ts:444` | unreferenced | delete | delete the key |
| `listDocumentsInputSchema.origin` | `contracts/src/databank/index.ts:468` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/transport/trpc/routers/databank.ts:78` |
| `listDocumentsInputSchema.cursor` | `contracts/src/databank/index.ts:474` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/transport/trpc/routers/databank.ts:82` |
| `wireCaptureSchema.responseHeaders` | `contracts/src/debug/index.ts:24` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/foundation/observability/debug/wire-capture.ts:195` |
| `wireCaptureSchema.responseBody` | `contracts/src/debug/index.ts:26` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/foundation/observability/debug/wire-capture.ts:195` |
| `wireCapturesResponseSchema.enabled` | `contracts/src/debug/index.ts:32` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `wireCapturesResponseSchema.count` | `contracts/src/debug/index.ts:33` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `wireCapturesResponseSchema.captures` | `contracts/src/debug/index.ts:34` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `rpgTracesResponseSchema.count` | `contracts/src/debug/index.ts:39` | never-read | delete | delete the key and its writes (`server/src/foundation/observability/debug/routes.ts:558`) |
| `rpgTracesResponseSchema.events` | `contracts/src/debug/index.ts:39` | never-read | delete | delete the key and its writes (`server/src/foundation/observability/debug/routes.ts:558`) and the 1 test reference |
| `debugErrorsResponseSchema.errors` | `contracts/src/debug/index.ts:43` | never-read | delete | delete the key and its writes (`server/src/foundation/observability/debug/routes.ts:383`) and the 1 test reference |
| `inspectedParticipantSchema.id` | `contracts/src/debug/index.ts:47` | unreferenced | delete | delete the key |
| `inspectedParticipantSchema.kind` | `contracts/src/debug/index.ts:48` | unreferenced | delete | delete the key |
| `inspectedParticipantSchema.role` | `contracts/src/debug/index.ts:49` | unreferenced | delete | delete the key |
| `inspectedParticipantSchema.userId` | `contracts/src/debug/index.ts:50` | unreferenced | delete | delete the key |
| `inspectedParticipantSchema.characterId` | `contracts/src/debug/index.ts:51` | unreferenced | delete | delete the key |
| `inspectedParticipantSchema.characterName` | `contracts/src/debug/index.ts:52` | unreferenced | delete | delete the key |
| `inspectedMessageSchema.id` | `contracts/src/debug/index.ts:56` | unreferenced | delete | delete the key |
| `inspectedMessageSchema.seq` | `contracts/src/debug/index.ts:57` | unreferenced | delete | delete the key |
| `inspectedMessageSchema.role` | `contracts/src/debug/index.ts:58` | unreferenced | delete | delete the key and the 1 test reference |
| `inspectedMessageSchema.authorUserId` | `contracts/src/debug/index.ts:59` | unreferenced | delete | delete the key |
| `inspectedMessageSchema.characterId` | `contracts/src/debug/index.ts:60` | unreferenced | delete | delete the key |
| `inspectedMessageSchema.personaId` | `contracts/src/debug/index.ts:61` | unreferenced | delete | delete the key |
| `inspectedMessageSchema.selectedVariantId` | `contracts/src/debug/index.ts:62` | unreferenced | delete | delete the key |
| `inspectedMessageSchema.excludedFromPrompt` | `contracts/src/debug/index.ts:63` | unreferenced | delete | delete the key |
| `inspectedMessageSchema.content` | `contracts/src/debug/index.ts:64` | unreferenced | delete | delete the key and the 1 test reference |
| `inspectedMessageSchema.model` | `contracts/src/debug/index.ts:65` | unreferenced | delete | delete the key |
| `inspectedMessageSchema.provider` | `contracts/src/debug/index.ts:66` | unreferenced | delete | delete the key |
| `inspectedChatSchema.id` | `contracts/src/debug/index.ts:72` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `inspectedChatSchema.title` | `contracts/src/debug/index.ts:73` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `inspectedChatSchema.starred` | `contracts/src/debug/index.ts:74` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `inspectedChatSchema.archived` | `contracts/src/debug/index.ts:75` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `inspectedChatSchema.temporary` | `contracts/src/debug/index.ts:76` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `inspectedChatSchema.startedAt` | `contracts/src/debug/index.ts:77` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `inspectedChatSchema.parentChatId` | `contracts/src/debug/index.ts:78` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `inspectedChatSchema.forkedAt` | `contracts/src/debug/index.ts:79` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `inspectedChatSchema.streamSeq` | `contracts/src/debug/index.ts:80` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `inspectedChatSchema.createdAt` | `contracts/src/debug/index.ts:81` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `inspectedChatSchema.updatedAt` | `contracts/src/debug/index.ts:82` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `inspectedEventSchema.id` | `contracts/src/debug/index.ts:87` | unreferenced | delete | delete the key |
| `inspectedEventSchema.seq` | `contracts/src/debug/index.ts:88` | unreferenced | delete | delete the key |
| `inspectedEventSchema.type` | `contracts/src/debug/index.ts:89` | unreferenced | delete | delete the key |
| `inspectedEventSchema.createdAt` | `contracts/src/debug/index.ts:90` | unreferenced | delete | delete the key |
| `chatInspectionFields.participants` | `contracts/src/debug/index.ts:95` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `chatInspectionFields.messages` | `contracts/src/debug/index.ts:96` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `chatInspectionFields.sessionFrameCount` | `contracts/src/debug/index.ts:97` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `chatInspectionFields.recentEvents` | `contracts/src/debug/index.ts:98` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `clientErrorReportSchema.requestId` | `contracts/src/diagnostics/client-error.ts:15` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/foundation/observability/client-error.ts:66` |
| `healthResponseSchema.status` | `contracts/src/diagnostics/health.ts:8` | unreferenced | delete | delete the key and the 7 test references |
| `healthResponseSchema.harness` | `contracts/src/diagnostics/health.ts:8` | unreferenced | delete | delete the key and the 7 test references |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
