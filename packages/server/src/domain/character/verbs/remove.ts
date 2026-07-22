// verb: remove — delete an owned character. Snapshot the avatar id BEFORE the delete (the cascade wipes the
// row), DELETE … WHERE id=? AND owner_id=? folds the ownership check + deletion (cascades snapshots /
// personas / downstream FKs — incl. the card's embeddings, so NO `character.updated` emit on delete). The
// avatar asset is then best-effort reaped via the injected assets op (the FK is SET NULL — deleting a
// character does NOT delete the asset; the assets domain decides whether the now-unreferenced blob is
// reaped). A reap failure logs + drops (it never fails the delete). Throws `CharacterNotFoundError` when
// not owned/found.

import { getLog } from "#foundation/observability";
import type { CharacterContext } from "../context";
import { CharacterNotFoundError } from "../contract/errors";
import type { RemoveCharacterParams } from "../contract/params";
import type { CharacterService } from "../contract/service";
import { deleteOwnedCharacter } from "../persistence/card";
import { loadOwnedCharacterRow } from "../persistence/queries";

export function createRemove(ctx: CharacterContext): CharacterService["remove"] {
  return async ({ principal, characterId }: RemoveCharacterParams) => {
    const ownerId = principal.userId;
    const row = await loadOwnedCharacterRow(ctx.db, ownerId, characterId);
    if (row === undefined) {
      throw new CharacterNotFoundError(characterId);
    }
    const { avatarAssetId, handle } = row;
    const at = ctx.now();

    // Free the expression-sprite bindings BEFORE the row delete so the freed assetIds are surfaced (the FK
    // cascade wipes the bindings but doesn't return their ids — expressions-design/01 §8). Optional op: a
    // deploy without the expressions leaf falls back to the cascade + a later GC sweep.
    const spriteAssetIds = ctx.reapCharacterSprites !== undefined ? await ctx.reapCharacterSprites(characterId) : [];

    const deleted = await deleteOwnedCharacter(ctx.db, characterId, ownerId);
    if (!deleted) {
      throw new CharacterNotFoundError(characterId);
    }

    const reap = [...(avatarAssetId !== null ? [avatarAssetId] : []), ...spriteAssetIds];
    if (reap.length > 0) {
      try {
        await ctx.reapAssets(reap);
      } catch (err) {
        getLog().warn({ err, characterId }, "character: avatar/sprite reap failed (orphan heals on GC)");
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
