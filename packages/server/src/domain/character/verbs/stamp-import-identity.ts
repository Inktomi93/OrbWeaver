// verb: stampImportIdentity — a seeded card carries the import identity of its own export, so a restore of that
// export onto a box that seeded the same card dedups instead of landing a second copy. Written only onto a row
// with no identity: an imported row keeps the one its import minted. Seeder-injected; acts on the resolved owner.

import type { StampImportIdentityParams } from "../contract/params.ts";
import type { CharacterContext, CharacterService } from "../contract/service.ts";
import { stampImportHashIfUnset } from "../persistence/queries.ts";

export function createStampImportIdentity(ctx: CharacterContext): CharacterService["stampImportIdentity"] {
  return async (params: StampImportIdentityParams): Promise<boolean> => await stampImportHashIfUnset(ctx.db, params);
}
