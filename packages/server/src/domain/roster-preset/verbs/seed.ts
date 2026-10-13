// The manifest's ordered characters become ordered seats under the receiving user's unchanged Principal.

import type { SeedRosterPreset } from "../contract/seed.ts";
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
