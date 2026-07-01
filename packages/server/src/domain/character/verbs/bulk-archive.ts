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
          throw new Error("missing");
        }
        if (row.archived === archived) {
          throw new Error("skipped");
        }
        return characterId;
      })
    );

    const toUpdate = results
      .filter((res): res is PromiseFulfilledResult<typeof res extends PromiseFulfilledResult<infer T> ? T : never> => res.status === "fulfilled")
      .map(res => res.value);

    let updated = 0;
    let missing = 0;
    let skipped = 0;

    for (const res of results) {
      if (res.status === "rejected") {
        if (res.reason instanceof Error && res.reason.message === "missing") {
          missing++;
        } else if (res.reason instanceof Error && res.reason.message === "skipped") {
          skipped++;
        } else {
          throw res.reason;
        }
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
