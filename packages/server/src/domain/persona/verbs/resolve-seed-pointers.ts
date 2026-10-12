// Only missing or foreign persona pointers degrade to absent; an operational failure must propagate.
import type { PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { PersonaNotFoundError } from "../contract/errors.ts";
import type { PersonaSeedPointerDeps, PersonaSeedPointers } from "../contract/seed-pointers.ts";
/** Resolve each founding pointer under its own user's authority. */
export function createResolvePersonaSeedPointers(deps: PersonaSeedPointerDeps): PersonaSeedPointers {
  return {
    resolveDefaultPersona: async (userId): ReturnType<PersonaSeedPointers["resolveDefaultPersona"]> => {
      const us = await deps.loadUserSettings(userId);
      const raw = us.seeds.defaultPersonaId;
      if (raw === null) {
        return null;
      }
      try {
        const persona = await deps.get({
          principal: deps.principalForUser(userId),
          personaId: castId<PersonaId>(raw),
        });
        return persona.id;
      } catch (err) {
        // Only a genuinely stale/deleted persona id is optional — a database, I/O, or program failure
        // must surface, never silently seat the room with no active persona (#760).
        if (err instanceof PersonaNotFoundError) {
          return null;
        }
        throw err;
      }
    },
    resolveCurrentPersona: async (userId): ReturnType<PersonaSeedPointers["resolveCurrentPersona"]> => {
      const us = await deps.loadUserSettings(userId);
      const raw = us.seeds.currentPersonaId;
      if (raw === null) {
        return null;
      }
      try {
        const persona = await deps.get({
          principal: deps.principalForUser(userId),
          personaId: castId<PersonaId>(raw),
        });
        return persona.id;
      } catch (err) {
        // Only a genuinely stale/deleted persona id is optional — a database, I/O, or program failure
        // must surface, never silently seat the room with no active persona (#760).
        if (err instanceof PersonaNotFoundError) {
          return null;
        }
        throw err;
      }
    },
  };
}
