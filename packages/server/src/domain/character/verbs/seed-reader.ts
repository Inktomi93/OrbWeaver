// Deleted seeded characters stay deleted: this resolves an owned handle but never mints a replacement.

import type { FindSeedCharacter } from "../contract/seed-reader.ts";
import type { CharacterService } from "../contract/service.ts";

export function createFindSeedCharacter(find: CharacterService["findByHandle"]): FindSeedCharacter {
  return async (principal, handle): ReturnType<FindSeedCharacter> => (await find({ ownerId: principal.userId, handle }))?.characterId ?? null;
}
