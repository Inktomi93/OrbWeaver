// verb: bulkRemove — delete many owned characters. Missing/foreign ids are SKIPPED, not thrown — a bulk
// selection can race a concurrent delete, and failing midway would leave an unexplainable partial. Each
// owned row is deleted (cascades as in single remove); the avatar assets are reaped ONCE at the end
// (best-effort — a reap failure logs + drops, never fails the deletes). No `character.updated` emit (delete
// cascades the embeddings via FK). The per-id load+delete pairs run concurrently (one libSQL connection
// serializes them); the single end-of-run reap keeps it to one assets round-trip.
//
// ORDER, per id: READ the avatar + sprite assetIds → delete the row → (only for rows that actually died)
// audit → emit → reap. The sprite op used to DETACH the bindings ahead of the delete, so a refused delete
// left a live character with freed sprites; and `charactersChanged` used to fire ahead of the audit writes,
// announcing a change whose audit trail could still reject. Reads first, destruction after the row is gone,
// the emit after the durable writes it announces.

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
          // READ the sprite assetIds before the row delete (the FK cascade doesn't surface the freed ids —
          // docs/plans/expressions/design.md). Optional op: absent falls back to the cascade + a later GC sweep.
          const spriteAssetIds = ctx.listCharacterSpriteAssets !== undefined ? await ctx.listCharacterSpriteAssets(characterId) : [];
          const ok = await deleteOwnedCharacter(ctx.db, characterId, ownerId, ctx.bumpStatsCanonVersion);
          return ok ? { row, spriteAssetIds } : null;
        }),
      )
    ).filter((d) => d !== null);
    const deletedRows = deleted.map((d) => d.row);

    if (deletedRows.length === 0) {
      return;
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
    ctx.emitUserEvent(ownerId, { type: "charactersChanged" });

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
