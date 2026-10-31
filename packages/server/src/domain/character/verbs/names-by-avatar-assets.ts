// verb: namesByAvatarAssets — the owner's characters named by the avatar asset ids a caller holds. A by-ids read:
// a surface that knows only an asset id never resolves it by walking a paged list. Owner-scoped in the query. A read:
// no audit, no emit.

import type { CharacterContext, CharacterService } from "../contract/service.ts";
import { namesByOwnerAvatarAssets } from "../persistence/queries.ts";

export function createNamesByAvatarAssets(ctx: CharacterContext): CharacterService["namesByAvatarAssets"] {
  return async ({ principal, assetIds }) => await namesByOwnerAvatarAssets(ctx.db, principal.userId, assetIds);
}
