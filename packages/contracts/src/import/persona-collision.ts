// A profile import never resolves a same-name, different-content persona silently: the review lists each
// collision and the user's choice rides the commit request, keyed by the persona's folded name.

import { z } from "zod";

/** Merge links chats to the existing persona and keeps its content; keep-both lands a numbered copy. */
export const PERSONA_COLLISION_CHOICES = ["merge", "keep-both"] as const;
export type PersonaCollisionChoice = (typeof PERSONA_COLLISION_CHOICES)[number];

/** What a run with no recorded choice for a collision does, and what the review preselects. */
export const DEFAULT_PERSONA_COLLISION_CHOICE = "merge" satisfies PersonaCollisionChoice;

/** Folded persona name → the user's choice for that collision. */
const personaCollisionChoiceSchema = z.enum(PERSONA_COLLISION_CHOICES);
export const personaCollisionChoicesSchema = z.record(z.string(), personaCollisionChoiceSchema).readonly();
export type PersonaCollisionChoices = z.infer<typeof personaCollisionChoicesSchema>;

/** The tree upload's repeated multipart field; each value is `<choice>:<folded name>`. */
export const PERSONA_COLLISION_FIELD = "personaCollision";

export function encodePersonaCollisionChoices(choices: PersonaCollisionChoices): string[] {
  return Object.entries(choices).map(([key, choice]) => `${choice}:${key}`);
}

/** The choices a set of {@link PERSONA_COLLISION_FIELD} values spell, or null when any value is malformed. */
export function decodePersonaCollisionChoices(values: readonly string[]): PersonaCollisionChoices | null {
  const choices: Record<string, PersonaCollisionChoice> = {};
  for (const value of values) {
    const colon = value.indexOf(":");
    const choice = personaCollisionChoiceSchema.safeParse(value.slice(0, colon));
    if (colon === -1 || !choice.success) {
      return null;
    }
    choices[value.slice(colon + 1)] = choice.data;
  }
  return choices;
}

const personaCollisionSchema = z.strictObject({
  /** The folded name — the key the choice is recorded under. */
  key: z.string(),
  name: z.string(),
  existingDescription: z.string(),
  incomingDescription: z.string(),
});
export type PersonaCollision = z.infer<typeof personaCollisionSchema>;

/** The review route's response. */
export const personaCollisionReviewSchema = z.strictObject({ collisions: z.array(personaCollisionSchema).readonly() });
export type PersonaCollisionReview = z.infer<typeof personaCollisionReviewSchema>;
