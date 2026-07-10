// Pure fork-tree assembly for the CONTEXT Activity tab (FINAL-Character §7) — the branch-aware chat
// manager for one character. A chat is a fork when `parentChatId != null` (D27 `forkChat` deep-copy; the
// only link is the parent pointer). The client already holds every chat with this character via
// `listChats` (each `ChatSummary` carries `parentChatId` + `participantCharacterIds` — §12 FIX #1), so the
// forest assembles CLIENT-SIDE with no `getChatLineage`/`getChatChildren` round-trip (those service verbs
// are NOT wired to the tRPC router). Pure + structural (takes the minimal row shape, not the full wire
// type) so it unit-tests browser-free (Spine-Testing.md §7); the tab composes it in RENDER (§5.1).

import type { CharacterId, ChatId } from "@orb/kit/ids";

/** The chat shape the forest reads (a structural subset of `ChatSummary`). */
export interface ActivityChat {
  readonly id: ChatId;
  /** The fork pointer (D27) — null for a root chat, else the parent it was forked from. */
  readonly parentChatId: ChatId | null;
  readonly title: string | null;
  readonly lastMessageAt: number | null;
  readonly messageCount: number;
  readonly createdAt: number;
  readonly participantCharacterIds: readonly CharacterId[];
}

/** One node in the character's fork forest — a chat + its fork children (recursively). */
export interface ActivityNode {
  readonly chat: ActivityChat;
  readonly children: readonly ActivityNode[];
}

/** Recency key: the newest message, else the creation time for a never-messaged chat (mirrors
 *  `resumeTargets`' `lastMessageAt ?? …` reduction). Descending order = "relationships, not a catalog". */
function recencyOf(chat: ActivityChat): number {
  return chat.lastMessageAt ?? chat.createdAt;
}

/** Sort siblings most-recent-first, `id` as the deterministic tiebreak (stable render + test). */
function byRecency(a: ActivityNode, b: ActivityNode): number {
  const delta = recencyOf(b.chat) - recencyOf(a.chat);
  return delta !== 0 ? delta : a.chat.id.localeCompare(b.chat.id);
}

/**
 * Assemble the fork forest of every chat that includes `characterId`. Roots are the chats whose parent is
 * NOT in the filtered set (a true root, or a fork whose parent doesn't include this character — its branch
 * still belongs under the character, surfaced as its own root). Children hang off `parentChatId`. Siblings
 * (incl. roots) sort by recency desc. A `visited` guard makes the recursion total even on malformed data
 * (D27 forks are acyclic by construction — parent predates child — so this only guards against a corrupt
 * pointer hanging the render, never a real cycle).
 */
export function buildActivityForest(
  chats: readonly ActivityChat[],
  characterId: CharacterId,
): readonly ActivityNode[] {
  const mine = chats.filter((chat) => chat.participantCharacterIds.includes(characterId));
  const byId = new Map<ChatId, ActivityChat>(mine.map((chat) => [chat.id, chat]));
  const childrenOf = new Map<ChatId, ActivityChat[]>();
  const roots: ActivityChat[] = [];
  for (const chat of mine) {
    const parent = chat.parentChatId;
    if (parent !== null && byId.has(parent)) {
      const bucket = childrenOf.get(parent);
      if (bucket === undefined) {
        childrenOf.set(parent, [chat]);
      } else {
        bucket.push(chat);
      }
    } else {
      roots.push(chat);
    }
  }
  const visited = new Set<ChatId>();
  const build = (chat: ActivityChat): ActivityNode => {
    visited.add(chat.id);
    const kids = (childrenOf.get(chat.id) ?? [])
      .filter((child) => !visited.has(child.id))
      .map(build)
      .sort(byRecency);
    return { chat, children: kids };
  };
  return roots.map(build).sort(byRecency);
}

/** The at-a-glance summary line for the Activity header — how many chats + when last played (the newest
 *  `lastMessageAt` across the filtered set, null when none has any message). Computed off the SAME filtered
 *  set the forest uses (one pass, no second filter drift). */
export interface ActivitySummary {
  readonly chatCount: number;
  readonly lastPlayedAt: number | null;
}

export function summarizeActivity(
  chats: readonly ActivityChat[],
  characterId: CharacterId,
): ActivitySummary {
  const mine = chats.filter((chat) => chat.participantCharacterIds.includes(characterId));
  let lastPlayedAt: number | null = null;
  for (const chat of mine) {
    if (
      chat.lastMessageAt !== null &&
      (lastPlayedAt === null || chat.lastMessageAt > lastPlayedAt)
    ) {
      lastPlayedAt = chat.lastMessageAt;
    }
  }
  return { chatCount: mine.length, lastPlayedAt };
}
