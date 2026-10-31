// Persona words more than one surface, or a test, must agree on.

/** The name field's error while it is blank. */
export const PERSONA_NAME_REQUIRED = "Name can't be empty.";

/** The notice that the crown moved to this persona. */
export function nowDefaultNotice(name: string): string {
  return `${name} is now your default.`;
}
