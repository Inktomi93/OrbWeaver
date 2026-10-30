---
kind: bug
status: open
updated: 2026-10-30
priority: P2
area: chat
---

# Wire or delete the chat verbs whose bus events have no production caller

## What

`editReasoning`, `clearReasoning` and `moveMessage` in `packages/server/src/domain/chat/verbs/edit.ts` emit `reasoningEdited`, `reasoningCleared` and `messagesReordered`, but no router procedure, job or tap calls them. Wire each verb to a router procedure and a client control: reasoning edit and clear on the message reasoning block, and move up or down on the message actions, matching the SillyTavern features they mirror. Delete a verb only on an owner ruling.

## Why

`docs/law/client-architecture-state-and-gates.md` bus rule 4 requires every declared event type to have an emit site in a reached verb. Only `tests/server/domain/chat/bus-golden.suite.int.test.ts` calls these verbs; `tests/e2e/live-reasoning-strip.local.spec.ts` notes that `chat.editReasoning` is unwired on purpose, so decide the product intent first.

## Done when

Each of the three event types is emitted from a verb that a production procedure reaches, with a test through that procedure, or the verb, its event type and its client handler are gone and `tsc` passes.

## Evidence

Filled at landing: what ran and where its output is.
