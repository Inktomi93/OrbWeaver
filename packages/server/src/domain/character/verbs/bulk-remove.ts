// Missing or foreign rows are skipped. Audit and notification follow deletion; owned avatars reap once.
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

    const deletedRows = (
      await Promise.all(
        characterIds.map(async (characterId) => {
          const row = await loadOwnedCharacterRow(ctx.db, ownerId, characterId);
          if (row === undefined) {
            return null;
          }
          const ok = await deleteOwnedCharacter(ctx.db, characterId, ownerId, ctx.bumpStatsCanonVersion);
          return ok ? row : null;
        }),
      )
    ).filter((d) => d !== null);

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

    const reap = deletedRows.map((row) => row.avatarAssetId).filter((id): id is AssetId => id !== null);
    if (reap.length > 0) {
      try {
        await ctx.reapAssets(reap);
      } catch (err) {
        getLog().warn({ err, count: reap.length }, "character: bulk avatar reap failed");
      }
    }
  };
}
