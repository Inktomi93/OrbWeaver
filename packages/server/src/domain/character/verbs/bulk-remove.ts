// verb: bulkRemove — delete many owned characters. Missing/foreign ids are SKIPPED, not thrown — a bulk
// selection can race a concurrent delete, and failing midway would leave an unexplainable partial. Each
// owned row is deleted (cascades as in single remove); the avatar assets are reaped ONCE at the end
// (best-effort — a reap failure logs + drops, never fails the deletes). No `character.updated` emit (delete
// cascades the embeddings via FK). The per-id load+delete pairs run concurrently (one libSQL connection
// serializes them); the single end-of-run reap keeps it to one assets round-trip.

import type { AssetId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import type { BulkRemoveParams } from "../contract/params";
import type { CharacterContext, CharacterService } from "../contract/service";
import { deleteOwnedCharacter } from "../persistence/card";
import { loadOwnedCharacterRow } from "../persistence/queries";

export function createBulkRemove(ctx: CharacterContext): CharacterService["bulkRemove"] {
  return async ({ principal, characterIds }: BulkRemoveParams) => {
    const ownerId = principal.userId;
    const at = ctx.now();

    const results = await Promise.allSettled(
      characterIds.map(async (characterId) => {
        const row = await loadOwnedCharacterRow(ctx.db, ownerId, characterId);
        if (row === undefined) {
          throw new Error("missing"); // Captured as missing
        }
        const ok = await deleteOwnedCharacter(ctx.db, characterId, ownerId);
        if (!ok) {
          throw new Error("missing");
        }
        return row;
      }),
    );

    const deletedRows = results
      .filter((res) => res.status === "fulfilled")
      .map((res) => (res as PromiseFulfilledResult<NonNullable<Awaited<ReturnType<typeof loadOwnedCharacterRow>>>>).value);
    
    let updated = deletedRows.length;
    let missing = 0;

    for (const res of results) {
      if (res.status === "rejected") {
        if (res.reason instanceof Error && res.reason.message === "missing") {
          missing++;
        } else {
          throw res.reason;
        }
      }
    }

    await Promise.all(
      deletedRows.map((row) =>
        ctx.audit(
          {
            actorUserId: ownerId,
            action: "character.remove",
            entityType: "character",
            entityId: row.id,
            metadata: { handle: row.handle, bulk: true },
          },
          at,
        ),
      ),
    );

    const reap: AssetId[] = deletedRows
      .map((row) => row.avatarAssetId)
      .filter((id): id is AssetId => id !== null);
    if (reap.length > 0) {
      try {
        await ctx.reapAssets(reap);
      } catch (err) {
        getLog().warn({ err, count: reap.length }, "character: bulk avatar reap failed");
      }
    }

    return { updated, missing, skipped: 0 };
  };
}
