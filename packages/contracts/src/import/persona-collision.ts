// A profile import never resolves a same-name, different-content persona silently: the review lists each
// collision and the user's choice rides the commit request, keyed by the persona's folded name.

import { z } from "zod";

/** Merge links chats to the existing persona and keeps its content; keep-both lands a numbered copy. */
export const PERSONA_COLLISION_CHOICES = ["merge", "keep-both"] as const;
export type PersonaCollisionChoice = (typeof PERSONA_COLLISION_CHOICES)[number];

/** What a run with no recorded choice for a collision does, and what the review preselects. */
export const DEFAULT_PERSONA_COLLISION_CHOICE = "merge" satisfies PersonaCollisionChoice;

const personaCollisionChoiceSchema = z.enum(PERSONA_COLLISION_CHOICES);

type ChoiceMap = Readonly<Record<string, PersonaCollisionChoice>>;

// Not `z.record`: it rebuilds the object by assignment, which drops an own `__proto__` key (a persona with
// that name). The value is validated in place, so JSON-parsed own keys survive untouched.
export const personaCollisionChoicesSchema = z.custom<ChoiceMap>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((v) => personaCollisionChoiceSchema.safeParse(v).success),
  "expected a map of persona name to merge or keep-both",
);

/** Folded persona name → the user's choice for that collision. */
export type PersonaCollisionChoices = z.output<typeof personaCollisionChoicesSchema>;

/** The tree upload's repeated multipart field; each value is `<choice>:<folded name>`. */
export const PERSONA_COLLISION_FIELD = "personaCollision";

export function encodePersonaCollisionChoices(choices: PersonaCollisionChoices): string[] {
  return Object.entries(choices).map(([key, choice]) => `${choice}:${key}`);
}

/** The choices a set of {@link PERSONA_COLLISION_FIELD} values spell, or null when any value is malformed. */
export function decodePersonaCollisionChoices(values: readonly string[]): PersonaCollisionChoices | null {
  const entries: [string, PersonaCollisionChoice][] = [];
  for (const value of values) {
    const colon = value.indexOf(":");
    const choice = personaCollisionChoiceSchema.safeParse(value.slice(0, colon));
    if (colon === -1 || !choice.success) {
      return null;
    }
    entries.push([value.slice(colon + 1), choice.data]);
  }
  // `fromEntries` defines own properties, so a persona named `__proto__` keeps its choice.
  return Object.fromEntries(entries);
}

/** The choice recorded for a folded name. Own keys only: a persona named `constructor` must read as
 *  unlisted (merge), not as the inherited function. */
export function personaCollisionChoiceFor(choices: PersonaCollisionChoices | undefined, key: string): PersonaCollisionChoice {
  return choices !== undefined && Object.hasOwn(choices, key) ? (choices[key] ?? DEFAULT_PERSONA_COLLISION_CHOICE) : DEFAULT_PERSONA_COLLISION_CHOICE;
}

/** Which parts of a persona's identity differ between the owned persona and the incoming one. */
export const PERSONA_DIFFERENCES = ["description", "avatar", "title", "placement"] as const;
export type PersonaDifference = (typeof PERSONA_DIFFERENCES)[number];

const personaCollisionSchema = z.strictObject({
  /** The folded name — the key the choice is recorded under. */
  key: z.string(),
  name: z.string(),
  existingDescription: z.string(),
  incomingDescription: z.string(),
  /** What differs, so the review can say it instead of showing two identical lines. Never empty. */
  differs: z.array(z.enum(PERSONA_DIFFERENCES)).readonly(),
  /** The name keep-both would land the incoming persona under. */
  keepBothName: z.string(),
});
export type PersonaCollision = z.infer<typeof personaCollisionSchema>;

/** The review route's response. */
export const personaCollisionReviewSchema = z.strictObject({ collisions: z.array(personaCollisionSchema).readonly() });
export type PersonaCollisionReview = z.infer<typeof personaCollisionReviewSchema>;
