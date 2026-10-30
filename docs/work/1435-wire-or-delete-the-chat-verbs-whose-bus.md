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

`docs/law/client-architecture-state-and-gates.md` bus rule 4 requires every declared event type to have an emit site in a reached verb. Only `tests/server/domain/chat/bus-golden.suite.int.test.ts` called these verbs before the router and client wired them.

## Done when

Each of the three event types is emitted from a verb that a production procedure reaches, with a test through that procedure, or the verb, its event type and its client handler are gone and `tsc` passes.

## Evidence

Wired, not deleted. `chat.editReasoning`, `chat.clearReasoning` and `chat.moveMessage` are router procedures in `packages/server/src/transport/trpc/routers/chat.ts`. The client controls are `packages/client/src/features/chat/components/message-reasoning.tsx` (Edit and Clear on the reasoning block, author or host) and `packages/client/src/features/chat/components/message-move-arrows.tsx` (Move up and Move down arrows in the message edit toolbar, host only, disabled at the true ends of the chat and while a turn is generating). The reasoning draft lives in `packages/client/src/state/message-edit-draft.ts` beside the body draft.

- `pnpm test tests/server/transport/trpc/routers/chat-reasoning-and-move.int.test.ts`: red on the old router (no procedure `chat.editReasoning` or `chat.moveMessage`), green after (2 tests). It covers author and host writes, a refused non-author, a refused member move, the resulting order, and each of `reasoningEdited`, `reasoningCleared` and `messagesReordered` on the bus. The refusal code is `BAD_REQUEST`, the same code `chat.editMessage` and `chat.deleteMessages` return to a non-author.
- `pnpm test:ct tests/client/features/chat/components/message-reasoning-and-move.ct.tsx`: 6 tests green. They cover the arrows in edit mode, the true ends, the first loaded row of a paged room moving up, the arrows disabled during a live turn, a member's toolbar with no arrows, and the reasoning controls. With the paging signal, the generating gate or the host gate removed, the matching test fails.
- The existing `MessageRow` and transcript CTs that `codegraph affected` names pass.
- `pnpm typecheck` on `packages/client/tsconfig.json`, `packages/server/tsconfig.json`, `tsconfig.json` and `tsconfig.tests-dom.json`: clean.
- Biome, ESLint and scoped dependency-cruiser on the changed files: clean.
