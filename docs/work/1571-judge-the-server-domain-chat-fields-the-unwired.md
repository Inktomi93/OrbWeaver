---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/chat fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `server/domain/chat`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `MatchedKey.key` | `server/src/domain/chat/assembly/context.ts:47` | never-read | delete | delete the field and its writes (`server/src/domain/chat/assembly/context.ts:228`) |
| `MatchedKey.matchedLatestUserMessage` | `server/src/domain/chat/assembly/context.ts:48` | never-read | delete | delete the field and its writes (`server/src/domain/chat/assembly/context.ts:228`) |
| `InjectionCandidate.worldEntry.keys` | `server/src/domain/chat/assembly/context.ts:85` | unreferenced | delete | delete the field |
| `SendRegexResult.sendUserText` | `server/src/domain/chat/assembly/context.ts:413` | never-read | delete | delete the field and its writes (`server/src/domain/chat/assembly/context.ts:861`) |
| `SendRegexResult.sendMacroFreezes` | `server/src/domain/chat/assembly/context.ts:417` | never-read | delete | delete the field and its writes (`server/src/domain/chat/assembly/context.ts:863`) |
| `HistoryTurn.extraTokens` | `server/src/domain/chat/assembly/history-budget.ts:29` | unreferenced | delete | delete the field |
| `NamedRow.role` | `server/src/domain/chat/assembly/names.ts:55` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `NamedRow.content` | `server/src/domain/chat/assembly/names.ts:56` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `NamedRow.name` | `server/src/domain/chat/assembly/names.ts:57` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `NamedRow.messageId` | `server/src/domain/chat/assembly/names.ts:58` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `CanonRow.folded` | `server/src/domain/chat/assembly/shape.ts:78` | never-read | delete | delete the field and its writes (`server/src/domain/chat/assembly/shape.ts:210`) |
| `ShapeInput.speakers.user` | `server/src/domain/chat/assembly/shape.ts:109` | never-read | delete | delete the field and its writes (`server/src/domain/chat/verbs/read.ts:1253`) |
| `ShapeInput.speakers.assistant` | `server/src/domain/chat/assembly/shape.ts:109` | never-read | delete | delete the field and its writes (`server/src/domain/chat/verbs/read.ts:1253`) |
| `ShapeOutput.stages.multiCharacter` | `server/src/domain/chat/assembly/shape.ts:171` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ShapeOutput.stages.withTail` | `server/src/domain/chat/assembly/shape.ts:174` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ShapeOutput.stages.injected` | `server/src/domain/chat/assembly/shape.ts:175` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ShapeOutput.stages.squashed` | `server/src/domain/chat/assembly/shape.ts:176` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ShapeOutput.stages.named` | `server/src/domain/chat/assembly/shape.ts:177` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ShapeOutput.stages.delivered` | `server/src/domain/chat/assembly/shape.ts:183` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `SquashMode.canonApart` | `server/src/domain/chat/assembly/shape.ts:548` | never-read | delete | delete the field and its writes (`server/src/domain/chat/assembly/shape.ts:645`) |
| `ChatEmitted.seq` | `server/src/domain/chat/bus.ts:81` | never-read | delete | delete the field and its writes (`server/src/domain/chat/bus.ts:278`) |
| `ChatEmitted.event` | `server/src/domain/chat/bus.ts:82` | never-read | delete | delete the field and its writes (`server/src/domain/chat/bus.ts:278`) |
| `AutoModeResult.turns` | `server/src/domain/chat/contract/arbitration.ts:96` | never-read | delete | delete the field and its writes (`server/src/domain/chat/engine/auto-mode.ts:77`) |
| `AutoModeResult.stopReason` | `server/src/domain/chat/contract/arbitration.ts:97` | never-read | delete | delete the field and its writes (`server/src/domain/chat/engine/auto-mode.ts:78`) |
| `ExtractQuietResult.text` | `server/src/domain/chat/contract/context.ts:188` | never-read | delete | delete the field and its writes (`server/src/domain/chat/verbs/extract-quiet.ts:120`) |
| `ExtractQuietResult.costUsd` | `server/src/domain/chat/contract/context.ts:189` | never-read | delete | delete the field and its writes (`server/src/domain/chat/verbs/extract-quiet.ts:120`) |
| `StoreDigestParams.signal` | `server/src/domain/chat/contract/context.ts:807` | never-read | delete | delete the field and its writes (`server/src/domain/chat/memory/generate/digests.ts:393`) |
| `DigestRow.isGroup` | `server/src/domain/chat/contract/memory.ts:170` | unreferenced | delete | delete the field |
| `DigestRow.topicAnchor` | `server/src/domain/chat/contract/memory.ts:175` | unreferenced | delete | delete the field |
| `DigestRow.keywords` | `server/src/domain/chat/contract/memory.ts:176` | unreferenced | delete | delete the field |
| `MemoryPassCounts.skipped` | `server/src/domain/chat/contract/memory.ts:184` | never-read | delete | delete the field and its writes (`server/src/domain/chat/memory/generate/digests.ts:253`) |
| `MemoryRecallRecord.seq` | `server/src/domain/chat/contract/memory.ts:230` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `MemoryRecallRecord.at` | `server/src/domain/chat/contract/memory.ts:231` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `MemoryRecallRecord.scopedCharacterId` | `server/src/domain/chat/contract/memory.ts:233` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `MemoryRecallRecord.trace` | `server/src/domain/chat/contract/memory.ts:234` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `MemoryBuildTrace.blocksBuilt` | `server/src/domain/chat/contract/memory.ts:270` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `MemoryBuildTrace.blocksSkipped` | `server/src/domain/chat/contract/memory.ts:271` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `MemoryBuildTrace.summarizeCalls` | `server/src/domain/chat/contract/memory.ts:272` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `MemoryBuildTrace.embedCalls` | `server/src/domain/chat/contract/memory.ts:273` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `MemoryBuildTrace.blocksSkippedTokenGuard` | `server/src/domain/chat/contract/memory.ts:276` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `MemoryBuildTrace.blocksSkippedEmpty` | `server/src/domain/chat/contract/memory.ts:280` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `MemoryBuildTrace.ms` | `server/src/domain/chat/contract/memory.ts:281` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `chatMetadataSchema.group` | `server/src/domain/chat/contract/metadata.ts:40` | unreferenced | wire (read) | check `chatMetadataSchema` against `ChatMetadata` (`satisfies z.ZodType<ChatMetadata>`) so its keys join the type's reads, then judge what remains |
| `chatMetadataSchema.roomOverrides` | `server/src/domain/chat/contract/metadata.ts:41` | unreferenced | wire (read) | check `chatMetadataSchema` against `ChatMetadata` (`satisfies z.ZodType<ChatMetadata>`) so its keys join the type's reads, then judge what remains |
| `chatMetadataSchema.opening` | `server/src/domain/chat/contract/metadata.ts:42` | unreferenced | wire (read) | check `chatMetadataSchema` against `ChatMetadata` (`satisfies z.ZodType<ChatMetadata>`) so its keys join the type's reads, then judge what remains |
| `chatMetadataSchema.toolRecurseLimit` | `server/src/domain/chat/contract/metadata.ts:43` | unreferenced | wire (read) | check `chatMetadataSchema` against `ChatMetadata` (`satisfies z.ZodType<ChatMetadata>`) so its keys join the type's reads, then judge what remains |
| `chatMetadataSchema.databankVisibility` | `server/src/domain/chat/contract/metadata.ts:44` | unreferenced | wire (read) | check `chatMetadataSchema` against `ChatMetadata` (`satisfies z.ZodType<ChatMetadata>`) so its keys join the type's reads, then judge what remains |
| `chatMetadataSchema.background` | `server/src/domain/chat/contract/metadata.ts:45` | unreferenced | wire (read) | check `chatMetadataSchema` against `ChatMetadata` (`satisfies z.ZodType<ChatMetadata>`) so its keys join the type's reads, then judge what remains |
| `chatMetadataSchema.rpg` | `server/src/domain/chat/contract/metadata.ts:46` | unreferenced | wire (read) | check `chatMetadataSchema` against `ChatMetadata` (`satisfies z.ZodType<ChatMetadata>`) so its keys join the type's reads, then judge what remains |
| `chatMetadataSchema.hostDisplayScripts` | `server/src/domain/chat/contract/metadata.ts:47` | unreferenced | wire (read) | check `chatMetadataSchema` against `ChatMetadata` (`satisfies z.ZodType<ChatMetadata>`) so its keys join the type's reads, then judge what remains |
| `chatMetadataSchema.offerChoices` | `server/src/domain/chat/contract/metadata.ts:51` | unreferenced | wire (read) | check `chatMetadataSchema` against `ChatMetadata` (`satisfies z.ZodType<ChatMetadata>`) so its keys join the type's reads, then judge what remains |
| `chatMetadataSchema.charactersCanReact` | `server/src/domain/chat/contract/metadata.ts:55` | unreferenced | wire (read) | check `chatMetadataSchema` against `ChatMetadata` (`satisfies z.ZodType<ChatMetadata>`) so its keys join the type's reads, then judge what remains |
| `chatMetadataSchema.reactionsEnabled` | `server/src/domain/chat/contract/metadata.ts:56` | unreferenced | wire (read) | check `chatMetadataSchema` against `ChatMetadata` (`satisfies z.ZodType<ChatMetadata>`) so its keys join the type's reads, then judge what remains |
| `chatMetadataSchema.regexEnabled` | `server/src/domain/chat/contract/metadata.ts:60` | unreferenced | wire (read) | check `chatMetadataSchema` against `ChatMetadata` (`satisfies z.ZodType<ChatMetadata>`) so its keys join the type's reads, then judge what remains |
| `chatMetadataSchema.memberPersonaLore` | `server/src/domain/chat/contract/metadata.ts:62` | unreferenced | wire (read) | check `chatMetadataSchema` against `ChatMetadata` (`satisfies z.ZodType<ChatMetadata>`) so its keys join the type's reads, then judge what remains |
| `chatMetadataSchema.regexTiers` | `server/src/domain/chat/contract/metadata.ts:63` | unreferenced | wire (read) | check `chatMetadataSchema` against `ChatMetadata` (`satisfies z.ZodType<ChatMetadata>`) so its keys join the type's reads, then judge what remains |
| `CommitMessageParams.blocks` | `server/src/domain/chat/contract/params.ts:211` | unreferenced | delete | delete the field |
| `GeneratedText.text` | `server/src/domain/chat/contract/results.ts:473` | never-read | delete | delete the field and its writes (`server/src/domain/chat/engine/engine.ts:2137`) |
| `GeneratedText.aborted` | `server/src/domain/chat/contract/results.ts:474` | never-read | delete (read) | no caller reads it; the callers that cancel already hold the signal: delete the field and its writes |
| `DrainReport.ran` | `server/src/domain/chat/contract/results.ts:486` | never-read | delete | delete the field and its writes (`server/src/domain/chat/verbs/turn.ts:2845`) and the 2 test references |
| `DrainReport.dropped` | `server/src/domain/chat/contract/results.ts:487` | never-read | delete | delete the field and its writes (`server/src/domain/chat/verbs/turn.ts:2845`) and the 2 test references |
| `StartChatData.chat` | `server/src/domain/chat/contract/results.ts:511` | never-read | delete | delete the field and its writes (`server/src/domain/chat/verbs/start-chat.ts:273`) and the 227 test references |
| `ForkData.chat` | `server/src/domain/chat/contract/results.ts:514` | never-read | delete | delete the field and its writes (`server/src/domain/chat/verbs/fork.ts:831`) and the 10 test references |
| `RedeemInviteData.chat` | `server/src/domain/chat/contract/results.ts:517` | never-read | delete | delete the field and its writes (`server/src/domain/chat/verbs/invites.ts:285`) |
| `RedeemInviteData.participant` | `server/src/domain/chat/contract/results.ts:518` | never-read | delete | delete the field and its writes (`server/src/domain/chat/verbs/invites.ts:297`) and the 1 test reference |
| `RoomEntityIdOf.character` | `server/src/domain/chat/contract/room-reach.ts:11` | unreferenced | delete | delete the field |
| `RoomEntityIdOf.persona` | `server/src/domain/chat/contract/room-reach.ts:12` | unreferenced | delete | delete the field |
| `RoomEntityIdOf.regex` | `server/src/domain/chat/contract/room-reach.ts:14` | unreferenced | delete | delete the field |
| `RoomEntityIdOf.databank` | `server/src/domain/chat/contract/room-reach.ts:15` | unreferenced | delete | delete the field |
| `ChatStreamReplayEvent.seq` | `server/src/domain/chat/contract/views.ts:20` | unreferenced | delete | delete the field |
| `ChatDetailData.participants` | `server/src/domain/chat/contract/views.ts:72` | never-read | delete | delete the field and its writes (`server/src/domain/chat/substrate/chat-detail.ts:76`) and the 8 test references |
| `ChatListPageData.items` | `server/src/domain/chat/contract/views.ts:80` | never-read | delete | delete the field and its writes (`server/src/domain/chat/verbs/read.ts:787`) and the 7 test references |
| `ChatLineageData.chain` | `server/src/domain/chat/contract/views.ts:83` | never-read | delete | delete the field and its writes (`server/src/domain/chat/verbs/read.ts:833`) and the 2 test references |
| `TurnPipelineResult.cacheBreakpointFromEnd` | `server/src/domain/chat/engine/pipeline.ts:233` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `TurnPipelineResult.imageDropped` | `server/src/domain/chat/engine/pipeline.ts:238` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `TurnPipelineResult.videoDropped` | `server/src/domain/chat/engine/pipeline.ts:241` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `TurnPipelineResult.toolsUnsupported` | `server/src/domain/chat/engine/pipeline.ts:266` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `TurnPipelineResult.guidedPlacedAsInjection` | `server/src/domain/chat/engine/pipeline.ts:271` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `TurnPipelineResult.providerRefused` | `server/src/domain/chat/engine/pipeline.ts:280` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `responseFormat.schema.responders` | `server/src/domain/chat/engine/smart-arbitrate.ts:217` | unreferenced | delete | delete the key |
| `actorRekeysSchema.sourceCharacterId` | `server/src/domain/chat/persistence/handoff-resume.ts:18` | unreferenced | delete | delete the key |
| `actorRekeysSchema.characterId` | `server/src/domain/chat/persistence/handoff-resume.ts:21` | unreferenced | delete | delete the key |
| `ChatRow.temporary` | `server/src/domain/chat/persistence/queries.ts:82` | unreferenced | delete | delete the field |
| `ChatRow.forkedAt` | `server/src/domain/chat/persistence/queries.ts:84` | unreferenced | delete | delete the field |
| `ChatRow.pendingHostUserId` | `server/src/domain/chat/persistence/queries.ts:87` | unreferenced | delete | delete the field |
| `SlotTarget.personaId` | `server/src/domain/chat/persistence/queries.ts:847` | unreferenced | delete | delete the field |
| `SlotTarget.selectedVariantIdx` | `server/src/domain/chat/persistence/queries.ts:849` | unreferenced | delete | delete the field |
| `ReactionRow.messageId` | `server/src/domain/chat/persistence/reactions.ts:38` | unreferenced | delete | delete the field |
| `SendRegexSink.sendUserText` | `server/src/domain/chat/substrate/assemble-gather.ts:40` | unreferenced | delete | delete the field |
| `SendRegexSink.sendMacroFreezes` | `server/src/domain/chat/substrate/assemble-gather.ts:43` | unreferenced | delete | delete the field |
| `SendRegexSink.memoryRecall` | `server/src/domain/chat/substrate/assemble-gather.ts:46` | never-read | delete | delete the field and its writes (`server/src/domain/chat/substrate/assemble-gather.ts:227`) |
| `HumanSeat.kind` | `server/src/domain/chat/substrate/participants-humans.ts:32` | unreferenced | delete | delete the field |
| `HumanSeat.userId` | `server/src/domain/chat/substrate/participants-humans.ts:33` | unreferenced | delete | delete the field |
| `HumanSeat.characterId` | `server/src/domain/chat/substrate/participants-humans.ts:34` | unreferenced | delete | delete the field |
| `PreviewInputs.api` | `server/src/domain/chat/verbs/read.ts:258` | never-read | delete | delete the field and its writes (`server/src/domain/chat/verbs/read.ts:485`) |
| `TurnBase.terminalTools` | `server/src/domain/chat/verbs/turn.ts:1920` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `TurnBase.respondsToLatestUserTurn` | `server/src/domain/chat/verbs/turn.ts:1926` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `TurnBase.freezeMacroRegistry` | `server/src/domain/chat/verbs/turn.ts:1932` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |

### Owner calls

Each row looks like a half-built feature. The owner decides whether to wire it or delete it.

| Field | At | Kind | Question |
| - | - | - | - |
| `SendParams.blocks` | `server/src/domain/chat/contract/params.ts:199` | unreferenced | nothing reads it; see `sendSchema.blocks`: wire block sends or delete both |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

Partial landing: 10 rows applied, 14 reclassed to keep, the rest not yet judged. The item stays open.

Applied: `DigestRow.isGroup`, `.topicAnchor`, `.keywords`; `MemoryPassCounts.skipped` (the digest and segment pass returns drop it); `AutoModeResult.turns` and `.stopReason` (`runAutoMode` returns the messages only; the step-level `done` reason still drives the loop); `CommitMessageParams.blocks`; `ReactionRow.messageId`; `HistoryTurn.extraTokens`; `PreviewInputs.api` (and its write in `resolvePreviewInputs`).

Reclassed to keep, each found by deleting the field and reading the typecheck or the reader:
- `MatchedKey.key`, `.matchedLatestUserMessage`: the activation trace carries `matchedKeys` into the host preview (`assembly/assemble.ts:728`), and `tests/server/domain/chat/assembly/world-info-watchdog-child.ts:75` asserts it.
- `SendRegexResult.sendUserText`, `.sendMacroFreezes`, `SendRegexSink.sendUserText`, `.sendMacroFreezes`, `.memoryRecall`: `verbs/turn.ts:1674`, `:1684` and `:808` read them through the verb's own restated sink type (`verbs/turn.ts:125`), which the scan does not follow.
- `RoomEntityIdOf.character`, `.persona`, `.regex`, `.databank`: `contract/room-reach.ts` indexes the type by `K`, and `persistence/room-reach.ts:41` and `entry/compose/room-reach.ts:23` need the typed ids.
- `ChatRow.temporary`, `.forkedAt`, `.pendingHostUserId`: `ChatDetailRow` (the detail wire row) requires them at `verbs/fork.ts:832`, `verbs/invites.ts:286`, `:348`, `verbs/read.ts:840` and `verbs/start-chat.ts:274`.
- `HumanSeat.kind`, `.userId`, `.characterId`: `ParticipantRowShape` requires them at `substrate/participants-humans.ts:45` and `:110`.
- `InjectionCandidate.worldEntry.keys`: its doc comment says the activation trace and host preview list the keys; not deleted.

Not judged here: the `ShapeOutput.stages`, `MemoryRecallRecord`, `MemoryBuildTrace`, `TurnPipelineResult`, `ChatEmitted` and `ChatStreamReplayEvent` rows (they feed traces, recorders or events), the `…Data` view rows, `chatMetadataSchema.*`, the results rows that would empty a type (`GeneratedText`, `DrainReport`, `ExtractQuietResult`, `StoreDigestParams.signal`), the persisted-JSON keys (`actorRekeysSchema`), the model-schema key `responders`, `NamedRow`, `CanonRow.folded`, `ShapeInput.speakers`, `SquashMode.canonApart`, `SlotTarget`, `PreviewInputs`-adjacent `TurnBase.*`. `SendParams.blocks` is the owner call and is left alone.

Ran `pnpm typecheck packages/server/tsconfig.json tsconfig.node.json tsconfig.tests-dom.json tsconfig.tests-iso.json` (exit 0). Suites (all exit 0): `core-modes`, `read-preview-honesty`, `react-tool-rows`, `commit-fence-races` (19 tests); `memory-build-lifecycle.suite`, `memory-build-rows`, `joined-speaker-label` (5); `chain-stop-untouched`, `stored-narrator-smart-chain`, `bus-golden.suite` (12), all under `tests/server/domain/chat`.
