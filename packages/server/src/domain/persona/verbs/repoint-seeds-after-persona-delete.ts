// The settings section writer remains the owner of validation and persistence; persona owns fallback choice.

import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { PersonaDeleteSeedsDeps } from "../contract/delete-seeds.ts";
import type { PersonaContext } from "../contract/service.ts";
import { loadNewestPersonaId } from "../persistence/newest-persona.ts";
import { nextSeedsAfterPersonaDelete } from "../substrate/deleted-seeds.ts";

/** Plan the seed pointers a delete of `deletedId` leaves, before the delete runs: only pointers that name it move. */
export function createPlanSeedRepointForPersonaDelete(assembly: DbAssemblyInput<PersonaDeleteSeedsDeps>): PersonaContext["planSeedRepointForPersonaDelete"] {
  const deps: PersonaDeleteSeedsDeps = { ...assembly, db: databaseForOwner(assembly.db) };
  return async (principal, deletedId) => {
    const ownerId = principal.userId;
    const seeds = (await deps.loadUserSettings(ownerId)).seeds;
    const stored = {
      defaultPersonaId: seeds.defaultPersonaId,
      currentPersonaId: seeds.currentPersonaId,
    };
    if (stored.defaultPersonaId !== deletedId && stored.currentPersonaId !== deletedId) {
      return { next: { ...stored, defaultMoved: false }, write: async (): Promise<void> => undefined };
    }
    const newest = await loadNewestPersonaId(deps.db, ownerId, deletedId);
    const next = nextSeedsAfterPersonaDelete(stored, deletedId, newest);
    return {
      next,
      write: async (): Promise<void> => {
        await deps.writeSeeds(principal, { currentPersonaId: next.currentPersonaId, defaultPersonaId: next.defaultPersonaId });
      },
    };
  };
}
