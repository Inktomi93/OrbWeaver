---
kind: work
status: open
updated: 2026-10-31
priority: P2
area: chat
plan: unwired-code
---

# Wire duplicate, reattribute and the fork list into the chat UI

## What

The server verbs duplicateMessage, reattributeMessages and listForks have no client caller (items 1500 Evidence). Wire Duplicate into the message menu, a per-message Reattribute action in the message menu, and a fork list in the chat details panel. The persona tools already reattribute a whole chat; the message action reattributes one message. Keep both. They share one server path where the whole-chat action can call the per-message verb; do not build a second write path. Check where SillyTavern places duplicate, reattribute and branch lists and follow its placement where our layout allows.

## Why

Owner ruling: these are wanted features, built server-side and never surfaced.

## Done when

Each action is reachable from the UI and runs the production verb; the per-message and whole-chat reattribute actions write through one server path; CTs mount each action through the production surface; side-eye passes the placements.

## Evidence

Duplicate and the fork list are wired. Reattribute is not.

- `chat.duplicateMessage` and `chat.listForks` are router procedures (`packages/server/src/transport/trpc/routers/chat.ts`). `tests/server/transport/trpc/routers/chat-duplicate-and-forks.int.test.ts` fails before them (no procedure on the path) and passes after.
- The message menu carries "Duplicate message" (`packages/client/src/features/chat/components/message-actions-row.tsx`). The This-chat tab carries a "Forks" section (`packages/client/src/features/chat/components/chat-forks-section.tsx`). `listForks` is refetched by the `chatsChanged` user event (`packages/client/src/data/invalidation-user.ts`).
- `tests/client/features/chat/components/chat-forks-and-duplicate.ct.tsx` mounts both through the production surfaces over the corpus server.

Reattribute is held back for two reasons.

- `reattributeMessages` stamps `characterId` on a chat slot and only checks `requireHost`. It does not check that the character belongs to the room or the host. `.claude/rules/chat.md` requires that gate at the write boundary, and a router procedure would expose the gap. The gate is a security change and needs an owner call.
- The item says the whole-chat persona action can call the per-message verb. It cannot: the persona tools restamp `personaId` through `reattributePersona`, a different column and a different authority (author-or-host, not host-only). "Reattribute from here" (`MESSAGE_REATTRIBUTE_NAME`) is that persona action.
