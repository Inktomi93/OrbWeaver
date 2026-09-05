// verb: restore — copy a snapshot blob → the live card row IN PLACE ("git checkout"). The pre-restore
// snapshot (so the restore is itself reversible) and the overwrite of the flat row ride ONE batch, with the
// `contentHash` flatten recomputed. Emits `character.updated` (the indexer re-embeds). The snapshot read is
// scoped to the owned character, so a foreign/absent snapshot collapses to `CharacterNotFoundError` (no
// existence leak), as does a non-owned character.
//
// A RESTORE THAT DID NOT HAPPEN LEAVES NO BOUNDARY IN THE HISTORY. The pre-restore snapshot used to be its
// own committed INSERT ahead of the write, so a refused write (raced-away row, unavailable background) threw
// with a spurious "before restore" entry already in the log — and every retry added another. Both writes are
// one `restoreCardInPlace` batch now; see its doc for the `changes()` witness that ties them together.

import { cardContentHash } from "#kit/serde/card";
import type { CharacterContext } from "../context.ts";
import { CHARACTER_BACKGROUND_UNAVAILABLE, CharacterNotFoundError, CharacterOperationError } from "../contract/errors.ts";
import type { RestoreParams } from "../contract/params.ts";
import type { CharacterService } from "../contract/service.ts";
import { restoreCardInPlace } from "../persistence/card.ts";
import { canonicalTagsOf, cardOf, detailOf, loadOwnedCharacterRow, loadOwnedCharacterWithAvatar, loadSnapshotContent } from "../persistence/queries.ts";
import { cardTokenSize } from "../substrate/card-tokens.ts";

const PRE_RESTORE_LABEL = "auto: before restore";

export function createRestore(ctx: CharacterContext): CharacterService["restore"] {
  return async ({ principal, characterId, snapshotId }: RestoreParams) => {
    const ownerId = principal.userId;
    const current = await loadOwnedCharacterRow(ctx.db, ownerId, characterId);
    if (current === undefined) {
      throw new CharacterNotFoundError(characterId);
    }
    const blob = await loadSnapshotContent(ctx.db, characterId, snapshotId);
    if (blob === undefined) {
      throw new CharacterNotFoundError(characterId);
    }

    const at = ctx.now();
    const written = await restoreCardInPlace(
      ctx.db,
      { characterId, ownerId },
      {
        ...blob,
        contentHash: cardContentHash(blob),
        tokenSize: cardTokenSize(blob),
        updatedAt: at,
      },
      {
        id: ctx.newSnapshotId(),
        characterId,
        content: cardOf(current),
        label: PRE_RESTORE_LABEL,
        createdAt: at,
      },
    );
    if (written === "background-unavailable") {
      throw new CharacterOperationError(CHARACTER_BACKGROUND_UNAVAILABLE, "The background asset is no longer available.");
    }
    if (written === "missing") {
      throw new CharacterNotFoundError(characterId);
    }

    // The emit follows the durable write AND its audit (the `create` ordering defect): an audit that rejects
    // must not leave the indexer re-embedding a restore the caller was told had failed.
    await ctx.audit(
      {
        actorUserId: ownerId,
        action: "character.restore",
        entityType: "character",
        entityId: characterId,
        metadata: { snapshotId },
      },
      at,
    );
    // Restoring a snapshot rewrites the card body → re-embed it (contentChanged always true for restore).
    ctx.emit({ type: "character.updated", characterId, contentChanged: true });
    ctx.emitUserEvent(ownerId, { type: "charactersChanged", characterId });

    const updated = await loadOwnedCharacterWithAvatar(ctx.db, ownerId, characterId);
    if (updated === undefined) {
      throw new CharacterNotFoundError(characterId);
    }
    return detailOf(updated, await canonicalTagsOf(ctx.db, characterId));
  };
}
