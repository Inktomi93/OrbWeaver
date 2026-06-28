// verb: remove — delete an owned character. Snapshot the avatar id BEFORE the delete (the cascade wipes the
// row), DELETE … WHERE id=? AND owner_id=? folds the ownership check + deletion (cascades snapshots /
// personas / downstream FKs — incl. the card's embeddings, so NO `character.updated` emit on delete). The
// avatar asset is then best-effort reaped via the injected assets op (the FK is SET NULL — deleting a
// character does NOT delete the asset; the assets domain decides whether the now-unreferenced blob is
// reaped). A reap failure logs + drops (it never fails the delete). Throws `CharacterNotFoundError` when
// not owned/found.

import { getLog } from "#foundation/observability";
import { CharacterNotFoundError } from "../contract/errors";
import type { RemoveCharacterParams } from "../contract/params";
import type { CharacterContext, CharacterService } from "../contract/service";
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

    const deleted = await deleteOwnedCharacter(ctx.db, characterId, ownerId);
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
  };
}
