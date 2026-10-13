// The manifest's ordered characters become ordered seats under the receiving user's unchanged Principal.

import type { Principal } from "@orb/contracts/identity";
import type { CharacterId } from "@orb/kit/ids";
import type { RosterSeedStepDeps, SeedRosterPreset } from "../contract/seed.ts";
import type { RosterPresetService } from "../contract/service.ts";

export function createSeedRosterPreset(create: RosterPresetService["create"]): SeedRosterPreset {
  return async (principal, roster): Promise<void> => {
    await create({
      principal,
      input: {
        name: roster.name,
        description: roster.description,
        game: roster.game,
        members: roster.characterIds.map((characterId, position) => ({ kind: "character" as const, characterId, position })),
      },
    });
  };
}

/** A deleted character stays absent; an all-deleted roster still settles rather than retrying forever. */
export function createRosterSeedStep(deps: RosterSeedStepDeps): (principal: Principal) => Promise<boolean> {
  return async (principal): Promise<boolean> => {
    const found = await Promise.all(deps.characterHandles.map((handle) => deps.findCharacter(principal, handle)));
    const characterIds = found.filter((id): id is CharacterId => id !== null);
    if (characterIds.length > 0) {
      await deps.createRosterPreset(principal, {
        name: deps.name,
        description: deps.description,
        characterIds,
        game: deps.startsGame ? {} : null,
      });
    }
    return true;
  };
}
