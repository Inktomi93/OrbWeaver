// The chat-list FILTER store: an optional "show only this character's chats" filter the Chats list
// honors — the ONE cross-feature seam letting the character editor's hero scope the Chats section
// without the character feature owning any chat state. Writer (editor hero) and reader
// (ChatListSurface) are sibling shell regions with no shared React ancestor, so they share through
// state, not props. Carries the name beside the id so the clear-chip needs no extra lookup.
// createGatedStore, not persisted: a hard reload landing on the unfiltered list is fine.

import type { CharacterId } from "@orb/kit/ids";
import { createGatedStore } from "./create-gated-store";

/** The active per-character chat-list filter — `null` = the full list. `name` backs the clear-chip label. */
export interface ChatListCharacterFilter {
  readonly id: CharacterId;
  readonly name: string;
}

interface ChatListFilterState {
  readonly characterFilter: ChatListCharacterFilter | null;
}

const useChatListFilterStore = createGatedStore<ChatListFilterState>(
  "chat-list-filter",
  (): ChatListFilterState => ({ characterFilter: null }),
);

/** Scope the Chats LIST to one character's threads (the hero "N chats ›" seam) — the LIST reads this and
 *  filters to chats seating this character, showing a "filtered by [name] ✕" clear affordance. */
export function setChatListCharacterFilter(filter: ChatListCharacterFilter): void {
  useChatListFilterStore.setState({ characterFilter: filter }, false, "chat-list-filter/set");
}

/** Clear the per-character filter — the LIST returns to the full chat list (the chip's ✕, and cleared on
 *  every "new chat" / character switch so a stale scope never lingers). */
export function clearChatListCharacterFilter(): void {
  useChatListFilterStore.setState({ characterFilter: null }, false, "chat-list-filter/clear");
}

/** Reactive: the active per-character chat-list filter (`null` = the full list). A primitive selector (the
 *  stored object is stable — set/cleared as a whole, never mutated — so no fresh-object churn). */
export function useChatListCharacterFilter(): ChatListCharacterFilter | null {
  return useChatListFilterStore((s) => s.characterFilter);
}
