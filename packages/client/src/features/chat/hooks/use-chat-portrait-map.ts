// The chat-row SEAT map (F7 + list-pane-projection D3) — one non-blocking `character.list` page folded
// into a characterId → {name, avatarHash} lookup the rows resolve their `participantCharacterIds` against.
// The NAME rides along because a multi-seat room paints an `AvatarStack`, and each stacked avatar needs its
// own initials fallback + accessible label.
//
// A plain `useQuery`, never a suspending one: portraits are DECORATION, so a slow or failed character read
// must never block or error the chats list — those rows simply keep their hue-seeded initials blob.
//
// Shared by both chat list panes (the chats section's list and the character screen's projection), so the
// two can't drift into different portrait limits or a suspending variant.

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "#data";
import type { ChatRowPortrait } from "../lib/chat-summary-row.ts";

/** One page of the character library — wide enough to cover any list a user can actually scan. */
const PORTRAIT_MAP_LIMIT = 200;

export function useChatPortraitMap(): ReadonlyMap<string, ChatRowPortrait> {
  const trpc = useTRPC();
  const characters = useQuery(trpc.character.list.queryOptions({ limit: PORTRAIT_MAP_LIMIT }));
  return new Map((characters.data?.items ?? []).map((character) => [character.id, { name: character.name, hash: character.avatarHash }] as const));
}

/**
 * true ⇒ the portrait read has not answered YET, so an empty map means "unknown", not "no portraits".
 *
 * Its own hook rather than a second return field: three callers want only the map, and the ONE caller that
 * needs the distinction is a surface reserving a box for faces that are still in flight (the chats pane's
 * strip — `face-strip.tsx` `pending`). Same query options, so it is the SAME cache entry (react-query dedupes
 * by key) and `PORTRAIT_MAP_LIMIT` keeps exactly one home; nothing here fires a second fetch.
 */
export function useChatPortraitMapPending(): boolean {
  const trpc = useTRPC();
  return useQuery(trpc.character.list.queryOptions({ limit: PORTRAIT_MAP_LIMIT })).isPending;
}
