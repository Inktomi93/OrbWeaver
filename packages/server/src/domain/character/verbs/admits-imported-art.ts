// verb: admitsImportedArt — the read-only twin of attachImportedArt's precondition, for an import dry run that must not
// write: whether the owner's character would take a PNG's art now (it exists and has none). A read: no audit, no emit.

import type { AdmitsImportedArtParams } from "../contract/params.ts";
import type { CharacterContext, CharacterService } from "../contract/service.ts";
import { admitsImportedArt } from "../persistence/queries.ts";

export function createAdmitsImportedArt(ctx: CharacterContext): CharacterService["admitsImportedArt"] {
  return ({ ownerId, characterId }: AdmitsImportedArtParams): Promise<boolean> => admitsImportedArt(ctx.db, ownerId, characterId);
}
