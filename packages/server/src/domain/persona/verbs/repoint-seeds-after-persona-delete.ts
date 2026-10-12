// The settings section writer remains the owner of validation and persistence; persona owns fallback choice.

import type { Principal } from "@orb/contracts/identity";
import type { Handle, PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { PersonaDeleteSeedsDeps } from "../contract/delete-seeds.ts";
import type { PersonaContext } from "../contract/service.ts";
import { loadNewestPersonaId } from "../persistence/newest-persona.ts";
import { nextSeedsAfterPersonaDelete } from "../substrate/deleted-seeds.ts";

/** Repoint only seed pointers that named the persona the owner just deleted. */
export function createRepointSeedsAfterPersonaDelete(deps: PersonaDeleteSeedsDeps): PersonaContext["repointSeedsAfterPersonaDelete"] {
  return async (ownerId, deletedId) => {
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
    // @orb-waive one-principal-mint-population(Principal): synthetic principal for persona-seed settings update; ends when a shared factory replaces it
    const principal: Principal = {
      userId: ownerId,
      role: "user",
      handle: castId<Handle>(ownerId),
      externalId: null,
      via: "fallback",
    };
    await deps.updateUserSettingsSection({
      principal,
      input: { section: "seeds", patch: { currentPersonaId: next.currentPersonaId, defaultPersonaId: next.defaultPersonaId } },
    });
    return next;
  };
}
