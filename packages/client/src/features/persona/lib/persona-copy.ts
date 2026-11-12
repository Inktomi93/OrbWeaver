// Persona words more than one surface, or a test, must agree on.

/** The persona editor's avatar control, named for the persona it changes. */
export function personaAvatarName(persona: string): string {
  return `Change avatar for ${persona}`;
}

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
