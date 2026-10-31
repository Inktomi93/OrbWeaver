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

Filled at landing: what ran and where its output is.
