---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/transport fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `server/transport`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `Services.sessions` | `server/src/transport/trpc/context.ts:67` | never-read | delete | delete the field and its writes (`server/src/entry/compose/services.ts:1480`) and the 2 test references |
| `RateLimitDecision.type` | `server/src/transport/trpc/context.ts:84` | never-read | delete | delete the field and its writes (`server/src/transport/trpc/trpc.ts:156`) |
| `Context.logger` | `server/src/transport/trpc/context.ts:100` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `Context.liveBuses` | `server/src/transport/trpc/context.ts:106` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `Context.services` | `server/src/transport/trpc/context.ts:120` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `Context.rateLimit` | `server/src/transport/trpc/context.ts:122` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `Context.presence` | `server/src/transport/trpc/context.ts:126` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `Context.sockets` | `server/src/transport/trpc/context.ts:131` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `Context.multiHumanCapable` | `server/src/transport/trpc/context.ts:136` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `Context.serverInstanceId` | `server/src/transport/trpc/context.ts:148` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `RoomArgs.multiHumanCapable` | `server/src/transport/trpc/contract/room-source.ts:39` | never-read | delete | delete the field and its writes (`server/src/transport/trpc/stream/socket.ts:124`) |
| `characterRouter.snapshot.label` | `server/src/transport/trpc/routers/character.ts:168` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/transport/trpc/routers/character.ts:173` |
| `commitMessageSchema.blocks` | `server/src/transport/trpc/routers/chat.ts:112` | unreferenced | delete | delete the key and the 2 test references |
| `impersonateStreamSchema.lastEventId` | `server/src/transport/trpc/routers/chat.ts:159` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/transport/trpc/routers/chat.ts:652` |
| `chatRouter.setRegexAllow.lever.kind` | `server/src/transport/trpc/routers/chat.ts:731` | unreferenced | delete | delete the key and the 1 test reference |
| `chatRouter.setRegexAllow.lever.enabled` | `server/src/transport/trpc/routers/chat.ts:731` | unreferenced | delete | delete the key and the 1 test reference |
| `chatRouter.setRegexAllow.lever.tier` | `server/src/transport/trpc/routers/chat.ts:732` | unreferenced | delete | delete the key |
| `connectionRouter.tokenizeWords.target` | `server/src/transport/trpc/routers/connection.ts:97` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/transport/trpc/routers/connection.ts:100` |
| `connectionRouter.embedSpaceChangePreview.change.kind` | `server/src/transport/trpc/routers/connection.ts:137` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `connectionRouter.embedSpaceChangePreview.change.task` | `server/src/transport/trpc/routers/connection.ts:137` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `connectionRouter.embedSpaceChangePreview.change.connectionId` | `server/src/transport/trpc/routers/connection.ts:137` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `connectionRouter.embedSpaceChangePreview.change.patch` | `server/src/transport/trpc/routers/connection.ts:138` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `credentialsRouter.add.metadata` | `server/src/transport/trpc/routers/credentials.ts:37` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/transport/trpc/routers/credentials.ts:47` |
| `credentialsRouter.markRevokedByUser.reason` | `server/src/transport/trpc/routers/credentials.ts:62` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/transport/trpc/routers/credentials.ts:67` |
| `discoveryRouter.browseCharacters.q` | `server/src/transport/trpc/routers/discovery.ts:119` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/transport/trpc/routers/discovery.ts:131` |
| `discoveryRouter.browseCharacters.cursor` | `server/src/transport/trpc/routers/discovery.ts:122` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/transport/trpc/routers/discovery.ts:134` |
| `discoveryRouter.cooccurringKeywords.limit` | `server/src/transport/trpc/routers/discovery.ts:279` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/transport/trpc/routers/discovery.ts:280` |
| `imageryRouter.editImage.n` | `server/src/transport/trpc/routers/imagery.ts:40` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/transport/trpc/routers/imagery.ts:50` |
| `imageryRouter.editImage.size` | `server/src/transport/trpc/routers/imagery.ts:41` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/transport/trpc/routers/imagery.ts:51` |
| `imageryRouter.extractPrompt.subjectCharacterId` | `server/src/transport/trpc/routers/imagery.ts:64` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/transport/trpc/routers/imagery.ts:73` |
| `presetRouter.update.kind` | `server/src/transport/trpc/routers/preset.ts:61` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/transport/trpc/routers/preset.ts:76` |
| `presetRouter.update.fork.name` | `server/src/transport/trpc/routers/preset.ts:67` | never-read | delete | delete the key and its writes (`client/src/features/preset/hooks/use-preset-autosave.ts:161`) and the 2 test references |
| `acceptedFieldSchema.field` | `server/src/transport/trpc/routers/refinery.ts:38` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `acceptedFieldSchema.greetingIndex` | `server/src/transport/trpc/routers/refinery.ts:39` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `acceptedFieldSchema.appendIndex` | `server/src/transport/trpc/routers/refinery.ts:43` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `acceptedFieldSchema.confirmDiverged` | `server/src/transport/trpc/routers/refinery.ts:45` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `refineryRouter.startSession.name` | `server/src/transport/trpc/routers/refinery.ts:55` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/transport/trpc/routers/refinery.ts:60` |
| `refineryRouter.updateSession.patch.name` | `server/src/transport/trpc/routers/refinery.ts:84` | unreferenced | delete | delete the key |
| `refineryRouter.updateSession.patch.guidance` | `server/src/transport/trpc/routers/refinery.ts:85` | never-read | delete | delete the key and its writes (`client/src/features/refinery/components/run-controls-card.tsx:75`) and the 1 test reference |
| `refineryRouter.updateSession.patch.selection` | `server/src/transport/trpc/routers/refinery.ts:88` | never-read | delete | delete the key and its writes (`client/src/features/refinery/surfaces/refinery-content-surface.tsx:308`) and the 4 test references |
| `refineryRouter.updateSession.patch.stageConfig` | `server/src/transport/trpc/routers/refinery.ts:89` | never-read | delete | delete the key and its writes (`client/src/features/refinery/components/refinery-context-tabs.tsx:178`) and the 1 test reference |
| `refineryRouter.updateSession.patch.status` | `server/src/transport/trpc/routers/refinery.ts:90` | unreferenced | delete | delete the key |
| `refineryRouter.runStage.rewriteRunId` | `server/src/transport/trpc/routers/refinery.ts:106` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/transport/trpc/routers/refinery.ts:110` |
| `refineryRouter.iterate.guidance` | `server/src/transport/trpc/routers/refinery.ts:115` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/transport/trpc/routers/refinery.ts:120` |
| `refineryRouter.updateSchema.patch.name` | `server/src/transport/trpc/routers/refinery.ts:198` | never-read | delete | delete the key and its writes (`client/src/features/refinery/components/schema-editor-dialog.tsx:134`) and the 1 test reference |
| `refineryRouter.updateSchema.patch.description` | `server/src/transport/trpc/routers/refinery.ts:199` | never-read | delete | delete the key and its writes (`client/src/features/refinery/components/schema-editor-dialog.tsx:134`) |
| `refineryRouter.updateSchema.patch.stage` | `server/src/transport/trpc/routers/refinery.ts:200` | unreferenced | delete | delete the key |
| `refineryRouter.updateSchema.patch.schema` | `server/src/transport/trpc/routers/refinery.ts:201` | never-read | delete | delete the key and its writes (`client/src/features/refinery/components/schema-editor-dialog.tsx:134`) |
| `workloadsRouter.start.targetOwnerId` | `server/src/transport/trpc/routers/workloads.ts:45` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/transport/trpc/routers/workloads.ts:61` |
| `workloadsRouter.estimateModelCalls.targetOwnerId` | `server/src/transport/trpc/routers/workloads.ts:74` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/transport/trpc/routers/workloads.ts:87` |
| `workloadsRouter.estimateModelCalls.assumeAdmitted` | `server/src/transport/trpc/routers/workloads.ts:75` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/transport/trpc/routers/workloads.ts:86` |
| `workloadsRouter.createSchedule.enabled` | `server/src/transport/trpc/routers/workloads.ts:139` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/transport/trpc/routers/workloads.ts:152` |

### Owner calls

Each row looks like a half-built feature. The owner decides whether to wire it or delete it.

| Field | At | Kind | Question |
| - | - | - | - |
| `sendSchema.blocks` | `server/src/transport/trpc/routers/chat.ts:97` | unreferenced | the send door accepts message content blocks and the send verb never reads them: wire block sends or delete the key and `SendParams.blocks` |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

Counts: 53 rows = applied 11, derived 0, kept 38, handed off 3 (1 to item 1698, 2 test-only writers), owner questions 1.

Method: codegraph on the transport context and routers; compiler probe (removed every candidate key, then `pnpm typecheck packages/client/tsconfig.json tooling/tsconfig.json tsconfig.node.json tsconfig.tests-dom.json`, errors sorted by file kind); after restoring the keys with writers the same five-program run plus `tsconfig.tests-iso.json` exited 0. Suites `tests/server/transport/trpc/stream/recipient-isolation.int.test.ts`, `bounded-list-inputs.int.test.ts`, `live-bus-isolation.int.test.ts`, `routers/chat-reasoning-and-move.int.test.ts` (26 passed).

| Rows | Class | Reader or writer |
| - | - | - |
| `RateLimitDecision.type`, `RoomArgs.multiHumanCapable` (with `RunSocketArgs.multiHumanCapable` and both `stream.ts` passes) | applied | no reader; the `room-source.ts` comment said no source reads it |
| `commitMessageSchema.blocks` (and `CommitMessageParams.blocks`), `markRevokedByUser.reason`, `browseCharacters.q`, `cooccurringKeywords.limit`, `editImage.size`, `preset.update.kind`, `start.targetOwnerId`, `estimateModelCalls.targetOwnerId`, `estimateModelCalls.assumeAdmitted` | applied | no writer in production, testkit, tooling, CT stories or tests (typecheck clean across all five programs) |
| `Context.logger/liveBuses/services/rateLimit/presence/sockets/multiHumanCapable/serverInstanceId` | kept | read as `ctx.<field>` in `routers/stream.ts:47-89`, `routers/chat.ts:658`, `trpc.ts:156`, `trpc.ts:205` |
| `characterRouter.snapshot.label` | kept | `tests/e2e/support/surface-character.ts` writes it |
| `impersonateStreamSchema.lastEventId` | kept | `routers/chat.ts:651` refuses a supplied token |
| `setRegexAllow.lever.kind/enabled/tier` | kept | `domain/chat/verbs/participants.ts:411-423` |
| `tokenizeWords.target` | kept | `tests/support/node/corpus-connection.ts` writes it |
| `embedSpaceChangePreview.change.*` | kept | `domain/connection/verbs/preview-embed-space-change.ts:53-62` |
| `browseCharacters.cursor` | kept | the client infinite query at `packages/client/src/features/discovery/components/corpus-browse-view.tsx:78` supplies it |
| `editImage.n`, `extractPrompt.subjectCharacterId` | kept | `tests/support/node/corpus-image-variants.ts` |
| `preset.update.fork.name` | kept | `domain/preset/verbs/update.ts:136` reads the fork intent; client writes it at `use-preset-autosave.ts:161` |
| `acceptedFieldSchema.*` | kept | `domain/refinery/substrate/accept-belts.ts:103-124` |
| `startSession.name` | kept | `tests/e2e/support/surface-sections.ts` writes it |
| `updateSession.patch.*`, `updateSchema.patch.*` | kept | `domain/refinery/verbs/update-session.ts:68-81`, `update-schema.ts:42-47` |
| `runStage.rewriteRunId`, `iterate.guidance` | kept | `tests/support/node/corpus-refinery.ts` writes both |
| `Services.sessions` | handed to 1698 | session row, untouched |
| `credentialsRouter.add.metadata` | handed off (test-only writers) | only `tests/server/**` int suites send it (for example `tests/server/domain/admin/persistence/card-embed-ledgers.int.test.ts:50`, `strike-policy-audits.suite.int.test.ts:17`) |
| `workloadsRouter.createSchedule.enabled` | handed off (test-only writers) | `tests/client/features/workloads/components/platform-action-groups.suite.ct.tsx`, `platform-schedule-dialog-dismissal.suite.ct.tsx` |
| `sendSchema.blocks` | owner question | the send door accepts content blocks and `SendParams.blocks` is never read; wiring block sends is a feature call, deleting drops the door's claim |

Follow-up: `BrowseCharactersParams.q` in `domain/discovery/contract/params.ts:86` has no writer now; item 1575 judges the domain side.
