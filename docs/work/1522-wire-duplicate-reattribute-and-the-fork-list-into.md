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

Duplicate, the fork list and the per-message Reattribute are wired.

- `chat.duplicateMessage` and `chat.listForks` are router procedures (`packages/server/src/transport/trpc/routers/chat.ts`). `tests/server/transport/trpc/routers/chat-duplicate-and-forks.int.test.ts` fails before them (no procedure on the path) and passes after.
- The message menu carries "Duplicate message" (`packages/client/src/features/chat/components/message-actions-row.tsx`). The This-chat tab carries a "Forks" section (`packages/client/src/features/chat/components/chat-forks-section.tsx`). `listForks` is refetched by the `chatsChanged` user event (`packages/client/src/data/invalidation-user.ts`).
- `tests/client/features/chat/components/chat-forks-and-duplicate.ct.tsx` mounts both through the production surfaces over the corpus server.

Owner ruling: add the gate, then wire.

- `reattributeMessages` (`packages/server/src/domain/chat/verbs/edit.ts`) refuses unless the target holds a present seat of this room. The gate is a term of the retained-canon fence (`admission`), so it runs in the batch that writes the stamp. `docs/law/Chat-Macro-Resolution.md` §5 records the ruling.
- A stranger's card, a nonexistent id, a deleted card and a removed seat get one NOT_FOUND. A removed seat stays refused until the host re-adds it, and a reply may still leave a removed voice. A seat lost after the read refuses the write as `aborted`, and the retry answers NOT_FOUND.
- A user line, an agent's reply, a narrator row and a comment are refused with `not_reattributable_message` (`isReattributableReply`). Before the gate, a user line reached the `messages_attribution_shape` CHECK as a 500.
- The verb moves the character rollups with the stamp, so a rebuild agrees. A repeated id counts once, and an unchanged voice writes nothing and emits nothing.
- `chat.reattributeMessages` is a strict input with `REATTRIBUTE_MESSAGES_MAX` ids. The host's "Reattribute" submenu (`packages/client/src/features/chat/components/reattribute-voice-menu.tsx`) sits on a reply and lists the room's other present seats.
- `tests/server/transport/trpc/routers/chat-reattribute-messages.int.test.ts` runs each attack through the procedure, and the gate tests fail on the ungated verb. Breaking the fence term, the seat's chat scope or the history floor each fails its test. With the gate removed, a stranger's card name reaches the host's export.
- `tests/client/features/chat/components/message-reattribute-voice.ct.tsx` mounts the submenu through the production transcript for a host and a member.

The item says the whole-chat persona action can call the per-message verb. It cannot: the persona tools restamp `personaId` through `reattributePersona`, a different column and a different authority (author-or-host, not host-only). "Reattribute from here" (`MESSAGE_REATTRIBUTE_NAME`) is that persona action, so the two write paths stay separate.
