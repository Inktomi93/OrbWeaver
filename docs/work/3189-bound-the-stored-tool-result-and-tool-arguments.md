---
kind: bug
status: open
updated: 2026-11-15
priority: P2
area: server
---

# Bound the stored tool result and tool arguments of a message

## What

`ToolCallRecord.result` and `.arguments` reach the `toolCalls` column of `message_variants` and every member's `MessageView.toolCalls` with no size bound. The result is built in `packages/server/src/domain/tool-use/verbs/execute-tool-calls.ts`, stored through the shared builders in `packages/server/src/domain/chat/persistence/canon-write.ts` (new slot and continue), and typed in `packages/contracts/src/chat/messages.ts`. The turn's stream stop (`packages/server/src/domain/chat/engine/stream-cap.ts`) counts only `text` and `reasoning` deltas (`packages/contracts/src/chat/bus.ts`), so model-emitted tool arguments pass it too.

## Why

Same defect class as the 98-million-character message: a tool (plugin guest or built-in) that returns a huge string, or a model that emits huge arguments, stores it and forces it onto every member's message list. The text cap names only the text columns.

## Done when

A tool result and the tool arguments are each refused or bounded by a named constant at one boundary (`executeToolCalls` and the call reduce, or the builders), never truncated silently; a composed-root case runs a tool that returns past the bound and asserts the named outcome and the stored row.

## Evidence

Filled at landing: what ran and where its output is.
