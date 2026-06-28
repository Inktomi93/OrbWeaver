// verb: snapshot — append a `character_snapshots` history blob (the "git commit"): the live card captured
// as one opaque JSON blob, owner-gated. Nothing FKs the snapshot table (invariant 4), so a snapshot can
// never pin or alter card resolution. The live card is unchanged → no `character.updated` emit. Throws
// `CharacterNotFoundError` when not owned/found.

import { CharacterNotFoundError } from "../contract/errors";
import type { SnapshotParams } from "../contract/params";
import type { CharacterContext, CharacterService } from "../contract/service";
import { appendSnapshot } from "../persistence/card";
import { cardOf, loadOwnedCharacterRow } from "../persistence/queries";

export function createSnapshot(ctx: CharacterContext): CharacterService["snapshot"] {
  return async ({ principal, characterId, label }: SnapshotParams) => {
    const ownerId = principal.userId;
    const row = await loadOwnedCharacterRow(ctx.db, ownerId, characterId);
    if (row === undefined) {
      throw new CharacterNotFoundError(characterId);
    }

    const id = ctx.newSnapshotId();
    const at = ctx.now();
    await appendSnapshot(ctx.db, {
      id,
      characterId,
      content: cardOf(row),
      label: label ?? null,
      createdAt: at,
    });

    await ctx.audit(
      {
        actorUserId: ownerId,
        action: "character.snapshot",
        entityType: "character",
        entityId: characterId,
        metadata: { snapshotId: id },
      },
      at,
    );

    return { id, characterId, createdAt: at };
  };
}
