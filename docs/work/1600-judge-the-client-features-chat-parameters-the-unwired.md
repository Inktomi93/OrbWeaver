---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/features/chat parameters the unwired params scan reports

## What

`pnpm unwired params` reports each of the parameters below in `client/features/chat`; `reports/unwired/params.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Parameter | At | Kind | Class | Decision |
| - | - | - | - | - |
| `GhostMessageRow.#0.renderContext` | `client/src/features/chat/components/ghost-message-row.tsx:240` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `MessageEditTextarea.#0.onSave` | `client/src/features/chat/components/message-edit-textarea.tsx:44` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `renderRowAvatar.args.imageUrlFor` | `client/src/features/chat/components/message-row-avatar.tsx:36` | unsupplied-prop | delete | delete the prop and its default path (2 calls) |
| `useSendMessage.opts.intent` | `client/src/features/chat/hooks/use-send-message.ts:54` | unsupplied-prop | delete (read) | no send passes a per-message intent and the chat page has no in-room preset swap: delete the option and its branch |
| `RowSkin.bubbleDecoration.args.imageUrlFor` | `client/src/features/chat/lib/message-row-variants.ts:130` | unsupplied-prop | delete | delete the prop and its default path (2 calls) |
| `recentFaces.cap` | `client/src/features/chat/lib/recent-faces.ts:28` | unsupplied | delete | delete the parameter and its default path (1 call) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired params` no longer reports the row.

## Evidence

Six rows: six applied, none kept, none handed off, no owner questions.

| Row | Result |
| - | - |
| `GhostMessageRow.#0.renderContext` | applied in `packages/client/src/features/chat/components/ghost-message-row.tsx`. Its only partner prop `rowCharacterId` was read only by that macro pass, so it goes too, with its one supplier `message-list-surface.tsx:318` (the unrendered macro path never ran: the single mount passed neither) |
| `MessageEditTextarea.#0.onSave` | applied in `packages/client/src/features/chat/components/message-edit-textarea.tsx`; the sole mount `message-row-parts.tsx:104` passes `message` and `moveNeighbours` |
| `renderRowAvatar.args.imageUrlFor` | applied in `packages/client/src/features/chat/components/message-row-avatar.tsx`; the owned-blob path is the only path left and `portraitSource` loses its `owned` flag |
| `useSendMessage.opts.intent` | applied in `packages/client/src/features/chat/hooks/use-send-message.ts`; the three mounts (`composer.tsx:120`, `chat-controls-band.tsx:399`, `choice-send-provider.tsx:33`) pass `chatId` and `onDraftCommitted` only. The router's `chat.send` input is untouched, and no send ever carried `intent`, so the request body is unchanged |
| `RowSkin.bubbleDecoration.args.imageUrlFor` | applied in `packages/client/src/features/chat/lib/art-decorations.ts` (`BubbleDecorationArgs` and `imageSource`) |
| `recentFaces.cap` | applied in `packages/client/src/features/chat/lib/recent-faces.ts`; the one caller `chat-list-character-filter.tsx:63` passes only the chats |

Survey: `codegraph_explore` on the six symbols; literal `rg` for `renderContext`, `rowCharacterId`, `onSave`, `imageUrlFor`, `intent`, `recentFaces` over `packages tests tooling scripts` read, with `-g '*.ts' -g '*.tsx'`; `bubbleDecoration` call sites in `tests/client/features/chat/components/*.ct.tsx` pass no `imageUrlFor`.

Proof: client typecheck clean; chat CTs in the lane report.
