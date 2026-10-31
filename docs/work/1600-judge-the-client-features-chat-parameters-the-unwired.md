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

Filled at landing: what ran and where its output is.
