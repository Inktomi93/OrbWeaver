// op: resolveConnectedPersona — the persona a solo-character founding auto-anchors: the founder's ONE persona
// connected to that character. Zero or two-plus connections (ambiguity), or a group founding, answer null so
// the room falls through to the default seed. Principal-less and compose-built; chat consumes it as an op.

import type { ChatContext } from "#domain/chat";
import type { PersonaContext } from "../context.ts";
import { loadOwnedConnectedPersonaIds } from "../persistence/queries.ts";

/** Two rows are enough to tell "exactly one" from "ambiguous". */
const AMBIGUITY_PROBE = 2;

export function createResolveConnectedPersona(ctx: Pick<PersonaContext, "db">): ChatContext["resolveConnectedPersona"] {
  return async (userId, characterIds) => {
    const [characterId] = characterIds;
    if (characterId === undefined || characterIds.length !== 1) {
      return null;
    }
    const personaIds = await loadOwnedConnectedPersonaIds(ctx.db, userId, characterId, AMBIGUITY_PROBE);
    const [only] = personaIds;
    return personaIds.length === 1 && only !== undefined ? only : null;
  };
}
