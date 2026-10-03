// verb: attachImportedArt — the JSON-then-PNG exception of the import identity (owner ruling): a PNG whose
// text matches a character that landed from a JSON card gives that row its art, once, and re-keys the row's
// import identity to the with-art hash, keeping the art-less one as a second key so the JSON still finds it.
// A row that already has art is left alone (false): that card is an alt-art version, a separate character.
// Import-injected; acts on the resolved `ownerId`.

import type { CharacterContext } from "../context.ts";
import type { AttachImportedArtParams } from "../contract/params.ts";
import type { CharacterService } from "../contract/service.ts";
import { attachArtIfMissing, ensureAssetOwned } from "../persistence/queries.ts";

const ATTACH_IMPORTED_ART = "character.attachImportedArt";
const CHARACTER_ENTITY = "character";

export function createAttachImportedArt(ctx: CharacterContext): CharacterService["attachImportedArt"] {
  return async ({ ownerId, characterId, avatarAssetId, importHash }: AttachImportedArtParams): Promise<boolean> => {
    await ensureAssetOwned(ctx.db, ownerId, avatarAssetId);
    const at = ctx.now();
    const attached = await attachArtIfMissing(ctx.db, { ownerId, characterId, avatarAssetId, importHash, at });
    if (!attached) {
      return false;
    }
    await ctx.audit(
      { actorUserId: ownerId, action: ATTACH_IMPORTED_ART, entityType: CHARACTER_ENTITY, entityId: characterId, metadata: { avatarAssetId } },
      at,
    );
    ctx.emitUserEvent(ownerId, { type: "charactersChanged", characterId });
    return true;
  };
}
