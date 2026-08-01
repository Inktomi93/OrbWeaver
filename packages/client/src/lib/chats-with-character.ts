// The D18 PROJECTION predicate — "chats with this character" as a filter over the ONE first-class chats
// read (`chat.listChats`), never a character-scoped home. `listChats` has no server-side character param
// (`ListChatsParams` is `{ includeArchived? }` only), so the projection is a client-side filter over the
// single cached membership list — exactly the D18-clean shape: a chat is first-class, and a character
// screen may only PROJECT the chats it appears in.
//
// Semantics are the CONTRACT's, not this file's: `ChatSummary.participantCharacterIds` deliberately includes
// DEPARTED character seats ("every chat you've had with them"), so a room she has since left IS part of her
// history. Ordering is the caller's input order (the server's newest-updated-first recency — the projection
// never re-sorts, list-pane-projection D4).
//
// HOME: client-shared `lib/`, NOT `features/chat/lib/` as the proposal's §13 file map sketched. The proposal
// requires BOTH landed consumers to ride one home in one commit (§7's "a second spelling of the predicate"
// wall) — the chats-pane filter chip (features/chat) AND the character editor's hero count
// (features/character). A feature-local home makes that impossible: `client-features-no-cross` (the LIVE
// dep-cruiser rule the proposal's own §7 cites) forbids the character→chat runtime import. Tier-4 `lib/` is
// the one home both features may import DOWN from.

import type { CharacterId } from "@orb/kit/ids";

/** The minimal chat-summary shape the predicate reads (structural, so it unit-tests without a data layer —
 *  the `filter-chats.ts` / `character-list-view.ts` precedent). */
export interface ChatWithCharacterSeats {
  readonly participantCharacterIds: readonly CharacterId[];
}

/** The chats whose character seats — PRESENT or DEPARTED — include `characterId`, in the input's order. */
export function chatsWithCharacter<T extends ChatWithCharacterSeats>(chats: readonly T[], characterId: CharacterId): readonly T[] {
  return chats.filter((chat) => chat.participantCharacterIds.includes(characterId));
}
