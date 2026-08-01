// The chat-row PORTRAIT map (F7) — one non-blocking `character.list` page folded into a
// characterId → avatarHash lookup the rows index with their `participantCharacterIds`.
//
// A plain `useQuery`, never a suspending one: portraits are DECORATION, so a slow or failed character read
// must never block or error the chats list — those rows simply keep their hue-seeded initials blob.
//
// Shared by both chat list panes (the chats section's list and the character screen's projection), so the
// two can't drift into different portrait limits or a suspending variant.

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "#data";

/** One page of the character library — wide enough to cover any list a user can actually scan. */
const PORTRAIT_MAP_LIMIT = 200;

export function useChatPortraitMap(): ReadonlyMap<string, string | null> {
  const trpc = useTRPC();
  const characters = useQuery(trpc.character.list.queryOptions({ limit: PORTRAIT_MAP_LIMIT }));
  return new Map((characters.data?.items ?? []).map((character) => [character.id, character.avatarHash] as const));
}
