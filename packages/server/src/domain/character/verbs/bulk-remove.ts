// verb: bulkRemove — delete many owned characters. Missing/foreign ids are SKIPPED, not thrown — a bulk
// selection can race a concurrent delete, and failing midway would leave an unexplainable partial. Each
// owned row is deleted (cascades as in single remove); the avatar assets are reaped ONCE at the end
// (best-effort — a reap failure logs + drops, never fails the deletes). No `character.updated` emit (delete
// cascades the embeddings via FK). The per-id load+delete pairs run concurrently (one libSQL connection
// serializes them); the single end-of-run reap keeps it to one assets round-trip.

import type { AssetId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import type { CharacterContext } from "../context.ts";
import type { BulkRemoveParams } from "../contract/params.ts";
import type { CharacterService } from "../contract/service.ts";
import { deleteOwnedCharacter } from "../persistence/card.ts";
import { loadOwnedCharacterRow } from "../persistence/queries.ts";

export function createBulkRemove(ctx: CharacterContext): CharacterService["bulkRemove"] {
  return async ({ principal, characterIds }: BulkRemoveParams) => {
    const ownerId = principal.userId;
    const at = ctx.now();

    const deleted = (
      await Promise.all(
        characterIds.map(async (characterId) => {
          const row = await loadOwnedCharacterRow(ctx.db, ownerId, characterId);
          if (row === undefined) {
            return null;
          }
          // Free the sprite bindings BEFORE the row delete (the FK cascade doesn't surface the freed ids —
          // expressions-design/01 §8). Optional op: absent falls back to the cascade + a later GC sweep.
          const spriteAssetIds = ctx.reapCharacterSprites !== undefined ? await ctx.reapCharacterSprites(characterId) : [];
          const ok = await deleteOwnedCharacter(ctx.db, characterId, ownerId);
          return ok ? { row, spriteAssetIds } : null;
        }),
      )
    ).filter((d) => d !== null);
    const deletedRows = deleted.map((d) => d.row);

    if (deletedRows.length === 0) {
      return;
    }
    ctx.emitUserEvent(ownerId, { type: "charactersChanged" });

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

    const reap: AssetId[] = [
      ...deletedRows.map((row) => row.avatarAssetId).filter((id): id is AssetId => id !== null),
      ...deleted.flatMap((d) => d.spriteAssetIds),
    ];
    if (reap.length > 0) {
      try {
        await ctx.reapAssets(reap);
      } catch (err) {
        getLog().warn({ err, count: reap.length }, "character: bulk avatar/sprite reap failed");
      }
    }
  };
}
