// The chat-list FILTER store (character-editor redesign · UI-Arch §4.2). Holds an optional "show only this
// character's chats" filter the Chats LIST honors — the ONE cross-feature seam that lets the character
// editor's hero "N chats ›" scope the roomy Chats section to a single character WITHOUT the character
// feature owning any chat state (no-config-bound-to-chats: the Chats domain CONSUMES this filter via an
// injected seam; the character side WRITES it; neither owns the other). Mirrors the selection-store family
// (character-selection-store / preset-selection-store): its own per-section concern, held here so the
// WRITER (the hero, a Characters-section surface) and the READER (`ChatListSurface`, a Chats-section
// surface) — sibling shell regions with no shared React ancestor — share it through state, not props.
//
// Carries the NAME beside the id so the LIST's "filtered by [name] ✕" chip needs no extra lookup (the
// writer — the editor — already has the resolved name; ChatSummary has no id→name map, only display
// `participantNames`). `createGatedStore` (not persisted): a transient device-local view scope — a hard
// reload landing on the unfiltered list is fine (state-law recap, UI-Arch §5). One field, well under the
// ≤10-field cap; a non-null value IS "the list is filtered".

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
