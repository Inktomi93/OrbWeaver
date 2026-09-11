// The ONE home for the character screen's two chat INTENTS. Both used to live inline in the editor hero;
// they are shared writers now — "New chat" is fired by the hero AND by the chats pane's empty state, and
// "N chats ›" reveals the CONTEXT tab that holds her history rather than jumping to the Chats section.
//
// `useStartChatWithCharacter` IS A HOOK NOW (chat-creation-draft-mode-replacement.md §4.1, R1). It used to be
// a plain store write: `startNewChat({characterIds})` handed the chat surface a rowless DRAFT and the row
// appeared at the first send. Creation is a real `chat.startChat` call, so the intent rides the ONE shared
// creation seam in `#data` (`useStartChat` — a feature may never import another feature, and `#state` cannot
// fire a mutation). `revealCharacterChats` stays a plain function: it is pure navigation.

import type { CharacterId } from "@orb/kit/ids";
import { useStartChat } from "#data";
import { clearChatListCharacterFilter, revealContextPanel, setActiveSection } from "#state";

/** The projection pane's container slot — the one string the shell stamps. */
export const CHARACTER_CHATS_PROJECTION_SLOT = "character-chats-projection";

/** The CONTEXT tab her chats live on (#501). One home for the id: the section DECLARES the tab with it and
 *  the hero's "N chats ›" REVEALS it by it, so the two cannot drift into a tab nothing can resolve. */
export const CHARACTER_CHATS_TAB_ID = "chats";

/** Always a FRESH chat with this character, landed in the room. Clears any per-character chats-pane filter
 *  so the new room isn't shown behind a stale scope chip. `useStartChat` owns the navigation (it seeds the
 *  room's read and enters it); the section switch is this intent's own half. */
export function useStartChatWithCharacter(): (characterId: CharacterId) => void {
  const { startChat } = useStartChat();
  return (characterId): void => {
    clearChatListCharacterFilter();
    setActiveSection("chats");
    // @orb-waive caught-failure-ownership(startChat): useStartChat's mutation carries
    // errorToast: "Couldn't start the chat." — the toast is the surface. Ends if useStartChat drops errorToast.
    startChat({ characterIds: [characterId] }).catch(() => undefined); // useStartChat's errorToast owns failure.
  };
}

/**
 * Bring her chats into view (the hero's "N chats ›", D8).
 *
 * IT REVEALS THE **CONTEXT** TAB NOW (#501). It used to dock the LIST pane, because with her selected the
 * LIST *was* her history; under the owner's "library stays docked" ruling the list is the library and her
 * chats are a CONTEXT tab, so the one intent points at the one home.
 *
 * `revealContextPanel` is the right door of the two: it writes BOTH visibility channels unconditionally, so
 * the phone gets the sheet and the desktop gets the dock. Its sibling `revealContextPanelBesideContent`
 * deliberately FOLDS the phone arm — but only because that sibling's body is already in CONTENT (a facet),
 * and a full-screen sheet would cover the thing the tap just opened. Her chats are nowhere in CONTENT, so
 * here the sheet IS the navigation (the rpg Scene→Quests shape).
 */
export function revealCharacterChats(): void {
  revealContextPanel(CHARACTER_CHATS_TAB_ID);
}
