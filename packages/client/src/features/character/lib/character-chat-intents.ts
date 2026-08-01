// The ONE home for the character screen's two chat INTENTS (list-pane-projection §3.4/§3.8). Both used to
// live inline in the editor hero; the LIST band now fires the same "New chat" and the hero's "N chats ›"
// points at the pane instead of jumping sections, so they are shared writers rather than two hero closures.
//
// Pure store writes + one focus move — no data reads, no hooks — so both the band (a `listHeader` render
// prop) and the editor hero (a CONTENT surface) can call them without a shared React ancestor.

import type { CharacterId } from "@orb/kit/ids";
import { clearChatListCharacterFilter, setActiveSection, setOpenOverlayPanel, setPanelMode, startNewChat } from "#state";

/** The projection pane's container slot — the one string the shell stamps and the hero focuses. */
export const CHARACTER_CHATS_PROJECTION_SLOT = "character-chats-projection";

/** Always a FRESH chat with this character, landed in the room. Clears any per-character chats-pane filter
 *  so the new draft isn't shown behind a stale scope chip. */
export function startChatWithCharacter(characterId: CharacterId): void {
  clearChatListCharacterFilter();
  startNewChat({ characterIds: [characterId] });
  setActiveSection("chats");
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
