// lib/character-activity-tree — the pure fork-forest assembly for the CONTEXT Activity tab
// (FINAL-Character §7). DOM-free logic extracted for a browser-free test (Spine-Testing.md §7): the
// participant filter, the parent→child forest (incl. a fork whose parent doesn't include the character
// surfacing as its own root), recency-desc sibling ordering, and the summary reduction.

import type { CharacterId, ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
// Deep import the PURE lib module (NOT the "@orb/client/features/character" barrel): a barrel import drags
// browser TSX into the dom-less root typecheck:graph program (the character-list-view.test.ts precedent).
import type { ActivityChat } from "../../../../../packages/client/src/features/character/lib/character-activity-tree";
import {
  buildActivityForest,
  summarizeActivity,
} from "../../../../../packages/client/src/features/character/lib/character-activity-tree";
import { expect, test } from "../../../../support/fixtures";

const ELARA = castId<CharacterId>("char_elara");
const KAI = castId<CharacterId>("char_kai");

const chat = (over: Omit<Partial<ActivityChat>, "id"> & { readonly id: string }): ActivityChat => ({
  id: castId<ChatId>(over.id),
  parentChatId: over.parentChatId ?? null,
  title: over.title ?? null,
  lastMessageAt: over.lastMessageAt ?? null,
  messageCount: over.messageCount ?? 0,
  createdAt: over.createdAt ?? 0,
  participantCharacterIds: over.participantCharacterIds ?? [ELARA],
});

test("filters to chats that include the character", () => {
  const forest = buildActivityForest(
    [
      chat({ id: "chat_a", participantCharacterIds: [ELARA] }),
      chat({ id: "chat_b", participantCharacterIds: [KAI] }),
      chat({ id: "chat_c", participantCharacterIds: [ELARA, KAI] }),
    ],
    ELARA,
  );
  // Both are message-less (equal recency) → deterministic id tiebreak: chat_a before chat_c.
  expect(forest.map((n) => n.chat.id)).toStrictEqual([
    castId<ChatId>("chat_a"),
    castId<ChatId>("chat_c"),
  ]);
});

test("nests forks under their parent as a tree", () => {
  const forest = buildActivityForest(
    [
      chat({ id: "chat_root", createdAt: 1 }),
      chat({ id: "chat_fork", parentChatId: castId<ChatId>("chat_root"), createdAt: 2 }),
      chat({
        id: "chat_grandfork",
        parentChatId: castId<ChatId>("chat_fork"),
        createdAt: 3,
      }),
    ],
    ELARA,
  );
  expect(forest).toHaveLength(1);
  const root = forest[0];
  expect(root?.chat.id).toBe(castId<ChatId>("chat_root"));
  expect(root?.children).toHaveLength(1);
  const fork = root?.children[0];
  expect(fork?.chat.id).toBe(castId<ChatId>("chat_fork"));
  expect(fork?.children[0]?.chat.id).toBe(castId<ChatId>("chat_grandfork"));
});

test("a fork whose parent is not in the set surfaces as its own root", () => {
  // The parent chat does NOT include this character (or was left) — its branch still belongs under the
  // character, so it becomes a root rather than vanishing.
  const forest = buildActivityForest(
    [
      chat({
        id: "chat_orphanfork",
        parentChatId: castId<ChatId>("chat_absent_parent"),
        createdAt: 5,
      }),
    ],
    ELARA,
  );
  expect(forest).toHaveLength(1);
  expect(forest[0]?.chat.id).toBe(castId<ChatId>("chat_orphanfork"));
});

test("orders siblings most-recent-first (lastMessageAt, then createdAt)", () => {
  const forest = buildActivityForest(
    [
      chat({ id: "chat_old", lastMessageAt: 10 }),
      chat({ id: "chat_new", lastMessageAt: 30 }),
      chat({ id: "chat_never", lastMessageAt: null, createdAt: 20 }),
    ],
    ELARA,
  );
  expect(forest.map((n) => n.chat.id)).toStrictEqual([
    castId<ChatId>("chat_new"),
    castId<ChatId>("chat_never"),
    castId<ChatId>("chat_old"),
  ]);
});

test("summarizes chat count + last-played across the filtered set", () => {
  const chats = [
    chat({ id: "chat_a", lastMessageAt: 10, participantCharacterIds: [ELARA] }),
    chat({ id: "chat_b", lastMessageAt: 40, participantCharacterIds: [ELARA] }),
    chat({ id: "chat_other", lastMessageAt: 99, participantCharacterIds: [KAI] }),
  ];
  expect(summarizeActivity(chats, ELARA)).toStrictEqual({ chatCount: 2, lastPlayedAt: 40 });
  expect(summarizeActivity(chats, KAI)).toStrictEqual({ chatCount: 1, lastPlayedAt: 99 });
});

test("last-played is null when no chat has a message", () => {
  const chats = [chat({ id: "chat_a", lastMessageAt: null })];
  expect(summarizeActivity(chats, ELARA)).toStrictEqual({ chatCount: 1, lastPlayedAt: null });
});
