// The ONE home for the character screen's two chat INTENTS (list-pane-projection §3.4/§3.8). Both used to
// live inline in the editor hero; the LIST band now fires the same "New chat" and the hero's "N chats ›"
// points at the pane instead of jumping sections, so they are shared writers rather than two hero closures.
//
// `useStartChatWithCharacter` IS A HOOK NOW (chat-creation-draft-mode-replacement.md §4.1, R1). It used to be
// a plain store write: `startNewChat({characterIds})` handed the chat surface a rowless DRAFT and the row
// appeared at the first send. Creation is a real `chat.startChat` call, so the intent rides the ONE shared
// creation seam in `#data` (`useStartChat` — a feature may never import another feature, and `#state` cannot
// fire a mutation). `revealChatsProjection` stays a plain function: it is pure navigation.

import type { CharacterId } from "@orb/kit/ids";
import { useStartChat } from "#data";
import { clearChatListCharacterFilter, setActiveSection, setOpenOverlayPanel, setPanelMode } from "#state";

/** The projection pane's container slot — the one string the shell stamps and the hero focuses. */
export const CHARACTER_CHATS_PROJECTION_SLOT = "character-chats-projection";

/** Always a FRESH chat with this character, landed in the room. Clears any per-character chats-pane filter
 *  so the new room isn't shown behind a stale scope chip. `useStartChat` owns the navigation (it seeds the
 *  room's read and enters it); the section switch is this intent's own half. */
export function useStartChatWithCharacter(): (characterId: CharacterId) => void {
  const { startChat } = useStartChat();
  return (characterId): void => {
    clearChatListCharacterFilter();
    setActiveSection("chats");
    void startChat({ characterIds: [characterId] });
  };
}

/**
 * Bring her chats into view (the hero's "N chats ›", D8 — re-pointed IN PLACE rather than jumping to the
 * Chats section: with her selected, the LIST pane already IS her history).
 *
 * NARROW: the LIST is a sheet, so open it — that reveals the pane AND moves focus into it.
 * WIDE: the pane is beside the editor, but it may be collapsed, so un-collapse it and move focus there —
 * a link that scrolls nothing and focuses nothing is a dead end (rule 1).
 */
export function revealChatsProjection(narrow: boolean): void {
  if (narrow) {
    setOpenOverlayPanel("list");
    return;
  }
  setPanelMode("list", "docked");
  const pane = (globalThis as { document?: { querySelector: (s: string) => { focus?: () => void } | null } }).document?.querySelector(
    `[data-slot="${CHARACTER_CHATS_PROJECTION_SLOT}"]`,
  );
  pane?.focus?.();
}
