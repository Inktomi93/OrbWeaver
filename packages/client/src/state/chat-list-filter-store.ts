// The chat-list FILTER store: an optional "show only this character's chats" filter the Chats list
// honors — the ONE cross-feature seam letting the character editor's hero scope the Chats section
// without the character feature owning any chat state. Writer (editor hero) and reader
// (ChatListSurface) are sibling shell regions with no shared React ancestor, so they share through
// state, not props. Carries the name beside the id so the clear-chip needs no extra lookup.
// createGatedStore, not persisted: a hard reload landing on the unfiltered list is fine.

import type { CharacterId } from "@orb/kit/ids";
import { createGatedStore } from "./create-gated-store.ts";

/** The active per-character chat-list filter — `null` = the full list. `name` backs the clear-chip label;
 *  `avatarHash` is the scoped character's FACE on the pane's strip. It rides the filter (both writers — a
 *  strip face and the picker row — already have it) because the strip must show the character it is
 *  filtering by even when she has NO chats yet, and since #192 the pane resolves faces from its chat ROWS,
 *  which by definition carry nothing about a character with no rows. */
export interface ChatListCharacterFilter {
  readonly id: CharacterId;
  readonly name: string;
  readonly avatarHash: string | null;
}

// THE OTHER TWO NARROWING AXES LIVE HERE TOO NOW (#490). They were `useState` inside `ChatListSurface`,
// which made them invisible to the LIST CHROME BAND — a sibling shell region with no shared React ancestor,
// exactly the problem this store was minted for. The measured consequence: the band printed `CHATS 896`
// while the pane showed twelve rows for `Hikari`, and printed the same 896 over a "No matches" empty state.
// A census that ignores the filters beside it is not a fact about anything the reader can see.
//
// The RAW typed search is what is stored, not the debounced one: the field is controlled off it, and a
// consumer that turns it into a QUERY damps it with the shared `CHAT_LIST_SEARCH_DEBOUNCE_MS`
// (`features/chat/lib/chat-list-scope.ts`) — one damper constant, applied by each consumer, rather than a
// second stored copy that could disagree with the field.
interface ChatListFilterState {
  readonly characterFilter: ChatListCharacterFilter | null;
  /** The raw text in the pane's search field (`""` = unsearched). */
  readonly search: string;
  /** The native month control's `YYYY-MM` anchor (`""` = unanchored). */
  readonly month: string;
}

const useChatListFilterStore = createGatedStore<ChatListFilterState>(
  "chat-list-filter",
  (): ChatListFilterState => ({ characterFilter: null, month: "", search: "" }),
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

/** The pane's search text. */
export function setChatListSearch(search: string): void {
  useChatListFilterStore.setState({ search }, false, "chat-list-filter/search");
}

/** The pane's month anchor (`YYYY-MM`, or `""` to unanchor). */
export function setChatListMonth(month: string): void {
  useChatListFilterStore.setState({ month }, false, "chat-list-filter/month");
}

/** Reactive: the RAW search text (the field is controlled off this; a query consumer damps it itself). */
export function useChatListSearch(): string {
  return useChatListFilterStore((s) => s.search);
}

/** Reactive: the month anchor (`""` = unanchored). */
export function useChatListMonth(): string {
  return useChatListFilterStore((s) => s.month);
}
