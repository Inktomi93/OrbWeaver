---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: chat
---

# Judge the chat members no production code calls

## What

`pnpm unwired` reports each member below with no production reference; `reports/unwired/unwired.json` holds the run. Apply the decision on each row.

A delete is checked by the compiler: if a composition site still needs the member structurally, `pnpm typecheck` refuses the delete and the member is linked instead. Paths are under `packages/`.

| Member | At | Scan | Decision |
| - | - | - | - |
| `ActiveTurnHandle.release` | `server/src/domain/chat/contract/active-turns.ts:19` | test-only | delete with its implementation and the 161 test files that name it |
| `PromptTransformRegistry.list` | `server/src/domain/chat/contract/context.ts:331` | builder-only | delete with its implementation and the 560 test files that name it |
| `ChatContext.searchCorpus` | `server/src/domain/chat/contract/context.ts:728` | builder-only | delete with its implementation |
| `ChatContext.getGroupConfig` | `server/src/domain/chat/contract/context.ts:741` | builder-only | delete with its implementation and the 7 test files that name it |
| `ChatContext.getRoomOverrides` | `server/src/domain/chat/contract/context.ts:742` | builder-only | delete with its implementation |
| `ChatBus.readRing` | `server/src/domain/chat/bus.ts:107` | test-only | delete with its implementation and the 1 test files that name it |
| `ChatService.listForks` | `server/src/domain/chat/contract/service.ts:177` | test-only | wire: a chat router procedure for the fork list, or delete it with its test |
| `ChatService.getActivePresetConfig` | `server/src/domain/chat/contract/service.ts:199` | test-only | delete with its implementation and the 1 test files that name it |
| `ChatService.previewSection` | `server/src/domain/chat/contract/service.ts:204` | test-only | wire: the preset editor's section preview procedure |
| `ChatService.peekPrompt` | `server/src/domain/chat/contract/service.ts:206` | test-only | wire: the prompt preview procedure |
| `ChatService.replayStreamEvents` | `server/src/domain/chat/contract/service.ts:228` | test-only | delete with its implementation and the 2 test files that name it |
| `ChatService.streamEventBounds` | `server/src/domain/chat/contract/service.ts:230` | test-only | delete with its implementation and the 1 test files that name it |
| `ChatService.duplicateMessage` | `server/src/domain/chat/contract/service.ts:300` | test-only | wire: a chat router procedure for the message duplicate action |
| `ChatService.clearVariables` | `server/src/domain/chat/contract/service.ts:314` | builder-only | delete with its implementation |
| `ChatService.reattributeMessages` | `server/src/domain/chat/contract/service.ts:359` | builder-only | wire: the host's reattribute action needs a procedure that calls it |

## Why

Chat verbs and context slots nothing calls keep untested product paths and dead wiring in the largest domain.

## Done when

Each member in the table is deleted, wired to the named caller, or linked as its decision says, with a server test through the composed root for each wired verb; `pnpm unwired` no longer reports any of them.

## Evidence

| Member | Outcome |
| - | - |
| `ActiveTurnHandle.release` | deleted: every verb disposes the handle with `using`; the registry's dispose stays idempotent |
| `PromptTransformRegistry.list` | deleted |
| `ChatContext.searchCorpus` | deleted with its `corpus` dep and its implementation in `createChatMemorySearchOps` |
| `ChatContext.getGroupConfig`, `getRoomOverrides` | deleted with their op types and the now-unused `getGroupConfig` and `getRoomOverrides` helpers in `contract/metadata.ts` |
| `ChatBus.readRing` | deleted with the in-process ring it read: nothing else read the ring, and replay reads `chat_events` |
| `ChatService.getActivePresetConfig` | deleted; its test uses read the room's preset from `DEFAULT_PROMPT_CONFIG` or the preview text |
| `ChatService.clearVariables` | deleted |
| `ChatService.listForks`, `previewSection`, `peekPrompt`, `replayStreamEvents`, `streamEventBounds`, `duplicateMessage`, `reattributeMessages` | owner calls, unchanged |

`tests/server/domain/chat/persistence/publication.int.test.ts` now proves durable-first through the fanned seq, which only the committed `chat_events` row can supply, instead of through the ring.

### Owner calls

- `ChatService.listForks` (`packages/server/src/domain/chat/contract/service.ts`): lists the membership-scoped fork children of a chat. No router procedure or client surface reads it; it would surface as a fork list in the chat's details panel. `getChatLineage`, the ancestor half, is routed. Recommendation: wire it with a procedure and a forks list, or delete it if forks stay a one-way lineage.
- `ChatService.previewSection` and `ChatService.peekPrompt`: one preset section's render, and the next turn's assembled prompt. `packages/server/src/transport/trpc/routers/chat.ts` keeps both unexposed on purpose, and `packages/client/src/features/chat/components/assembly-preview-panel.tsx` defers the section affordance. They would surface in the preset editor and the prompt inspector. Item [0501](0501-wire-or-delete-the-unused-prompt-preview-verbs.md) already holds this question.
- `ChatService.replayStreamEvents` and `ChatService.streamEventBounds`: the read half of the durable SSE token log (`chat_stream_events`), a late subscriber's resume from a cursor. The live stream resumes from `chat_events`, so nothing reads the token log; deleting these two leaves a table that is written every turn and never read. It would surface as mid-reply resume after a reconnect. Recommendation: decide whether the token log stays; if not, delete the two verbs with the table and its writer in one change.
- `ChatService.duplicateMessage`: copies a slot and its selected variant to a new tail slot. No procedure or message action offers it; it would surface as a "Duplicate" item in the message menu.
- `ChatService.reattributeMessages`: the host re-stamps the speaking character of a set of slots. No procedure offers it; it would surface as a host "Reattribute" action on messages.
