// verb: bulkArchive — archive / un-archive many owned characters in one owner-scoped statement. `archived`
// is an identity flag, NOT card content — so there is NO `contentHash` recompute and NO `character.updated`
// emit (the embedded card text is unchanged). Foreign/missing ids simply don't match the WHERE. Audits once
// with the count actually flipped.

import type { BulkArchiveParams } from "../contract/params";
import type { CharacterContext, CharacterService } from "../contract/service";
import { setArchivedBulk } from "../persistence/card";

export function createBulkArchive(ctx: CharacterContext): CharacterService["bulkArchive"] {
  return async ({ principal, characterIds, archived }: BulkArchiveParams) => {
    const ownerId = principal.userId;
    const flipped = await setArchivedBulk(ctx.db, ownerId, characterIds, archived);
    if (flipped.length > 0) {
      await ctx.audit(
        {
          actorUserId: ownerId,
          action: archived ? "character.archive" : "character.unarchive",
          entityType: "character",
          metadata: { count: flipped.length, bulk: true },
        },
        ctx.now(),
      );
    }
  };
}
