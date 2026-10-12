import type { PersonaId } from "@orb/kit/ids";
import type { PersonaSeedRepoint } from "../contract/results.ts";

/** A deleted default prefers the last-played survivor; a deleted current prefers the default. */
export function nextSeedsAfterPersonaDelete(
  stored: Pick<PersonaSeedRepoint, "defaultPersonaId" | "currentPersonaId">,
  deletedId: PersonaId,
  newest: PersonaId | null,
): PersonaSeedRepoint {
  const surviving = (id: PersonaId | null): PersonaId | null => (id === deletedId ? null : id);
  const defaultMoved = stored.defaultPersonaId === deletedId;
  const defaultPersonaId = defaultMoved ? (surviving(stored.currentPersonaId) ?? newest) : stored.defaultPersonaId;
  return { defaultPersonaId, currentPersonaId: surviving(stored.currentPersonaId) ?? defaultPersonaId ?? newest, defaultMoved };
}
