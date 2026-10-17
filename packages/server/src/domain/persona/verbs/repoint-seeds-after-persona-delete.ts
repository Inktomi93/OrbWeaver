// The settings section writer remains the owner of validation and persistence; persona owns fallback choice.

import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { PersonaDeleteSeedsDeps } from "../contract/delete-seeds.ts";
import type { PersonaContext } from "../contract/service.ts";
import { loadNewestPersonaId } from "../persistence/newest-persona.ts";
import { nextSeedsAfterPersonaDelete } from "../substrate/deleted-seeds.ts";

/** Repoint only seed pointers that named the persona the owner just deleted. */
export function createRepointSeedsAfterPersonaDelete(assembly: DbAssemblyInput<PersonaDeleteSeedsDeps>): PersonaContext["repointSeedsAfterPersonaDelete"] {
  const deps: PersonaDeleteSeedsDeps = { ...assembly, db: databaseForOwner(assembly.db) };
  return async (principal, deletedId) => {
    const ownerId = principal.userId;
    const seeds = (await deps.loadUserSettings(ownerId)).seeds;
    const stored = {
      defaultPersonaId: seeds.defaultPersonaId === null ? null : castId<PersonaId>(seeds.defaultPersonaId),
      currentPersonaId: seeds.currentPersonaId === null ? null : castId<PersonaId>(seeds.currentPersonaId),
    };
    if (stored.defaultPersonaId !== deletedId && stored.currentPersonaId !== deletedId) {
      return { ...stored, defaultMoved: false };
    }
    const newest = await loadNewestPersonaId(deps.db, ownerId);
    const next = nextSeedsAfterPersonaDelete(stored, deletedId, newest);
    await deps.writeSeeds(principal, { currentPersonaId: next.currentPersonaId, defaultPersonaId: next.defaultPersonaId });
    return next;
  };
}
