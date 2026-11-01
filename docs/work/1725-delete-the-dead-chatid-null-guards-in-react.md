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

First-party tool handlers receive a chat-turn execution context with non-null `chatId` and `turnId`, so the null guards in the react, rpg and imagery tools are gone.

## Why

Owner ruling: chat-scoped tools get an execution type with non-null `chatId` and `turnId`, then the guards delete. No off-turn path reaches a builtin, because `isDirectDrivableBy` admits contributor tools alone, so the guards could never fire.

## Done when

`ToolHandler` takes `ChatToolExecutionContext`. Automation resolves through `resolveDrivableTools`, and handing `executeToolCalls` a first-party set with a nullable context fails to compile. Tool behavior is unchanged.

## Evidence

`tests/server/domain/automation/contract/chat-tool-scope.test-d.ts` holds the type contract; weakening the `ResolvedToolSet` default makes its `@ts-expect-error` lines report unused. The lane report lists the floor commands.
