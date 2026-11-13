// Persona words more than one surface, or a test, must agree on.

/** The name field's error while it is blank. */
export const PERSONA_NAME_REQUIRED = "Name can't be empty.";

/** The room block's action that removes the card's persona pin, as a button and as a menu item. */
export const CLEAR_PIN_NAME = "Clear pin";

/** The notice that the crown moved to this persona. */
export function nowDefaultNotice(name: string): string {
  return `${name} is now your default.`;
}

/** The delete confirm's line when the crowned persona is the one going: who the crown moves to. */
export function deleteMovesDefaultNote(name: string): string {
  return `Your default moves to “${name}”.`;
}

/** The name that tells a player apart from their persona: the account's display name, or its handle when the
 *  display name is the persona's own (an account made from a persona starts out with that name). */
export function playerNameOf(player: { readonly displayName: string; readonly handle: string | null }, persona: string): string {
  return player.displayName === persona && player.handle !== null ? player.handle : player.displayName;
}

/** A persona named with the player behind its seat. A seat named like its persona says the name once. */
export function personaWithPlayer(persona: string, player: string): string {
  return persona === player ? persona : `${persona} (${player})`;
}

/** The persona editor's identity fields. */
export const PERSONA_NAME_FIELD_NAME = "Name";
export const PERSONA_DESCRIPTION_FIELD_NAME = "Description";
/** The persona editor's picker subtitle field. */
export const PERSONA_TITLE_FIELD_NAME = "Title";

/** The persona editor footer's verbs. Delete also names the confirm's button. */
export const PERSONA_DUPLICATE_NAME = "Duplicate";
export const PERSONA_EXPORT_NAME = "Export";
export const PERSONA_DELETE_NAME = "Delete";

/** The editor's provenance line on a persona converted from a character. */
export const PERSONA_FROM_CARD_NAME = "From a character card";

/** The identity widget: its rail entry, its popover, and the rail trigger while no persona is playing. */
export const PERSONA_PANEL_NAME = "Account & personas";

/** The playing mark's label and the panel head's line above the playing persona. */
export const PERSONA_PLAYING_AS_LABEL = "Playing as";

/** The panel head's line in a room whose seat has no persona. */
export const PERSONA_NO_SEAT_GLOSS = "No persona set. Pick one below.";

/** The panel head's line outside a room, by where a new chat's persona comes from. */
export const PERSONA_NEW_CHAT_GLOSS = {
  default: "New chats start as (your default)",
  lastPlayed: "New chats start as (last played)",
} as const;

/** The rail trigger while a persona is playing. */
export function personaPlayingAsName(persona: string): string {
  return `Playing as ${persona}`;
}

/** The panel's door to the Personas settings. */
export const PERSONA_MANAGE_NAME = "Manage personas in Settings";

/** The room block's door that moves the viewer's lines to the playing persona. */
export const PERSONA_RESTAMP_NAME = "Restamp my messages to this persona";

/** The host's menu that pins the card to another member's persona. */
export const PERSONA_REPIN_NAME = "Re-pin…";

/** A switcher row's body: the switch it offers, or that it is already the one playing. */
export function personaSwitchName(subject: string, playing: boolean): string {
  return playing ? `${subject}, current persona` : `Switch to ${subject}`;
}

/** The host's pin toggle on a switcher row, by whether the card is pinned to that persona. */
export function personaCardPinName(subject: string, pinned: boolean): string {
  return pinned ? `Card is pinned to ${subject}. Press to unpin` : `Pin the card to ${subject}`;
}

/** The coarse-pointer row menu's twin of the pin toggle. */
export const PERSONA_PIN_CARD_HERE_NAME = "Pin card here";
export const PERSONA_UNPIN_CARD_NAME = "Unpin card";

/** A settings row's disclosure of its editor, by whether the editor is open. */
export function personaDetailsToggleName(subject: string, expanded: boolean): string {
  return expanded ? `Hide details for ${subject}` : `Show details for ${subject}`;
}

/** The delete confirmation's title. */
export const PERSONA_DELETE_TITLE = "Delete this persona?";

/** The first-run gate's title, and what it says when the create is refused. */
export const PERSONA_FIRST_RUN_TITLE = "Who are you in the story?";
export const PERSONA_FIRST_RUN_FAILED = "Couldn't create your persona. Try again.";

/** The first-run gate's submit: create the persona, or on the recovery arm finish the pointer the seed write missed. */
export const PERSONA_FIRST_RUN_CREATE_NAME = "Create persona";
export const PERSONA_FIRST_RUN_FINISH_NAME = "Finish setting up";
export const PERSONA_FIRST_RUN_FINISHING_LABEL = "Finishing…";

/** The marks lesson's title. */
export const PERSONA_MARKS_LESSON_TITLE = "The four marks";

/** The list band's create button. */
export const PERSONA_NEW_NAME = "New persona";

/** The list band's door to minting a persona from a card, that picker dialog's title and its character search. */
export const PERSONA_FROM_CHARACTER_NAME = "New persona from a character";

/** The list band's import door. It names the format: a SillyTavern persona has no standalone file, so that route is the
 *  profile-folder import under Backup & Restore, which the Personas help points to. */
export const PERSONA_RESTORE_NAME = "Restore a persona from an Orbweaver backup file";
