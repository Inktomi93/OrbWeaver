// verb: restore — copy a snapshot blob → the live card row IN PLACE ("git checkout"). Snapshot-current-
// first (so the restore is itself reversible), then overwrite the flat row with the blob, recomputing the
// `contentHash` flatten. Emits `character.updated` (the indexer re-embeds). The snapshot read is scoped to
// the owned character, so a foreign/absent snapshot collapses to `CharacterNotFoundError` (no existence
// leak), as does a non-owned character.

import { cardContentHash } from "#kit/serde/card";
import { CharacterNotFoundError } from "../contract/errors";
import type { RestoreParams } from "../contract/params";
import type { CharacterContext, CharacterService } from "../contract/service";
import { appendSnapshot, writeCardInPlace } from "../persistence/card";
import {
  cardOf,
  detailOf,
  loadOwnedCharacterRow,
  loadOwnedCharacterWithAvatar,
  loadSnapshotContent,
} from "../persistence/queries";

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
    // Snapshot the CURRENT card first so the restore can itself be undone.
    await appendSnapshot(ctx.db, {
      id: ctx.newSnapshotId(),
      characterId,
      content: cardOf(current),
      label: PRE_RESTORE_LABEL,
      createdAt: at,
    });

    const written = await writeCardInPlace(ctx.db, characterId, ownerId, {
      ...blob,
      contentHash: cardContentHash(blob),
    });
    if (!written) {
      throw new CharacterNotFoundError(characterId);
    }

    ctx.emit({ type: "character.updated", characterId });
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

    const updated = await loadOwnedCharacterWithAvatar(ctx.db, ownerId, characterId);
    if (updated === undefined) {
      throw new CharacterNotFoundError(characterId);
    }
    return detailOf(updated);
  };
}
