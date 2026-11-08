// Persona words more than one surface, or a test, must agree on.

/** The name field's error while it is blank. */
export const PERSONA_NAME_REQUIRED = "Name can't be empty.";

/** The notice that the crown moved to this persona. */
export function nowDefaultNotice(name: string): string {
  return `${name} is now your default.`;
}

/** The delete confirm's line when the crowned persona is the one going: who the crown moves to. */
export function deleteMovesDefaultNote(name: string): string {
  return `Your default moves to “${name}”.`;
}

/** A persona named with the player behind its seat. A seat named like its persona says the name once. */
export function personaWithPlayer(persona: string, player: string): string {
  return persona === player ? persona : `${persona} (${player})`;
}
