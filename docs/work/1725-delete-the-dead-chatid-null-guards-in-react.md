---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: server
plan: unwired-code
---

# Delete the dead chatId === null guards in react-tool-handler.ts and rpg/tools/index.ts

## What

Left open and not deleted: the guards are the type narrowing, not defensive code.

## Why

At runtime both are unreachable: `ChatToolExecFrame` in `packages/server/src/domain/chat/contract/engine-context.ts` carries a non-null `chatId` and `turnId`, and builtin tools are not direct-drivable from automation (`packages/server/src/domain/tool-use/substrate/reachability.ts`). The type still allows null: `ToolHandler` receives `ToolExecutionContext`, whose `chatId` is `ChatId | null` for the automation and plugin callers. Deleting a guard needs a cast or a handler param that narrows, which a function-typed `ToolHandler` rejects. The rpg guard also checks `turnId`.

## Done when

The owner decides whether chat-scoped tools get an exec type with a non-null `chatId` and `turnId` (a scope split on `ToolDefinition`). After that the guards delete without a cast.

## Evidence

No change landed.
