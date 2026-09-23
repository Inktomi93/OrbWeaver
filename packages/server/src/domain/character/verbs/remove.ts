// verb: remove — delete an owned character. Snapshot the avatar id AND the expression-sprite assetIds BEFORE
// the delete (the cascade wipes both without surfacing them), DELETE … WHERE id=? AND owner_id=? folds the
// ownership check + deletion (cascades snapshots / personas / downstream FKs — incl. the card's embeddings,
// so NO `character.updated` emit on delete). The assets are then best-effort reaped via the injected assets
// op (the FK is SET NULL — deleting a character does NOT delete the asset; the assets domain decides whether
// the now-unreferenced blob is reaped). A reap failure logs + drops (it never fails the delete). Throws
// `CharacterNotFoundError` when not owned/found.
//
// EVERY DESTRUCTIVE STEP IS DOWNSTREAM OF THE DELETE. The sprite op used to DETACH the bindings before the
// row delete was known to have succeeded, so a refused delete left a live character with its sprites already
// freed. Reads come first, destruction comes after the row is gone — see `ListCharacterSpriteAssetsOp`.

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

    // READ the sprite assetIds before the row delete — the FK cascade wipes the bindings without returning
    // their ids (docs/plans/expressions/design.md). Optional op: a deploy without the expressions leaf falls back to
    // the cascade + a later GC sweep. Nothing is detached here; the cascade below does that.
    const spriteAssetIds = ctx.listCharacterSpriteAssets !== undefined ? await ctx.listCharacterSpriteAssets(characterId) : [];

    const deleted = await deleteOwnedCharacter(ctx.db, characterId, ownerId, ctx.bumpStatsCanonVersion);
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
