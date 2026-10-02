// Avatar reaping follows a successful owned delete; a failed delete never frees a live asset.
import { getLog } from "#foundation/observability";
import type { CharacterContext } from "../context.ts";
import { CharacterNotFoundError } from "../contract/errors.ts";
import type { RemoveCharacterParams } from "../contract/params.ts";
import type { CharacterService } from "../contract/service.ts";
import { deleteOwnedCharacter } from "../persistence/card.ts";
import { loadOwnedCharacterRow } from "../persistence/queries.ts";

export function createRemove(ctx: CharacterContext): CharacterService["remove"] {
  return async ({ principal, characterId }: RemoveCharacterParams) => {
    const ownerId = principal.userId;
    const row = await loadOwnedCharacterRow(ctx.db, ownerId, characterId);
    if (row === undefined) {
      throw new CharacterNotFoundError(characterId);
    }
    const { avatarAssetId, handle } = row;
    const at = ctx.now();

    const deleted = await deleteOwnedCharacter(ctx.db, characterId, ownerId, ctx.bumpStatsCanonVersion);
    if (!deleted) {
      throw new CharacterNotFoundError(characterId);
    }

    if (avatarAssetId !== null) {
      try {
        await ctx.reapAssets([avatarAssetId]);
      } catch (err) {
        getLog().warn({ err, characterId }, "character: avatar reap failed (orphan heals on GC)");
      }
    }

    await ctx.audit(
      {
        actorUserId: ownerId,
        action: "character.remove",
        entityType: "character",
        entityId: characterId,
        metadata: { handle },
      },
      at,
    );
    ctx.emitUserEvent(ownerId, { type: "charactersChanged", characterId });
  };
}
