// verb: bulkArchive — archive / un-archive many owned characters in one owner-scoped statement. `archived`
// is an identity flag, NOT card content — so there is NO `contentHash` recompute and NO `character.updated`
// emit (the embedded card text is unchanged). Foreign/missing ids simply don't match the WHERE. Audits once
// with the count actually flipped.

import type { BulkArchiveParams } from "../contract/params";
import type { CharacterContext, CharacterService } from "../contract/service";
import { setArchivedBulk } from "../persistence/card";
import { loadOwnedCharacterRow } from "../persistence/queries";

export function createBulkArchive(ctx: CharacterContext): CharacterService["bulkArchive"] {
  return async ({ principal, characterIds, archived }: BulkArchiveParams) => {
    const ownerId = principal.userId;

    const results = await Promise.allSettled(
      characterIds.map(async (characterId) => {
        const row = await loadOwnedCharacterRow(ctx.db, ownerId, characterId);
        if (row === undefined) {
          return { status: "missing" as const };
        }
        if (row.archived === archived) {
          return { status: "skipped" as const };
        }
        return { status: "updated" as const, id: characterId };
      }),
    );

    let updated = 0;
    let missing = 0;
    let skipped = 0;
    const toUpdate: string[] = [];

    for (const res of results) {
      if (res.status === "rejected") {
        throw res.reason;
      }
      if (res.value.status === "missing") {
        missing++;
      } else if (res.value.status === "skipped") {
        skipped++;
      } else {
        toUpdate.push(res.value.id);
      }
    }

    if (toUpdate.length > 0) {
      const flipped = await setArchivedBulk(ctx.db, ownerId, toUpdate, archived);
      updated = flipped.length;
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

    return { updated, missing, skipped };
  };
}
