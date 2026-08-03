// verb: snapshot — append a `character_snapshots` history blob (the "git commit"): the live card captured
// as one opaque JSON blob, owner-gated. Nothing FKs the snapshot table (invariant 4), so a snapshot can
// never pin or alter card resolution. The live card is unchanged → no `character.updated` emit (the indexer
// re-reads nothing). It IS a user-facing mutation with a read surface (`listSnapshots` → the History tab), so
// it fires the user-bus `charactersChanged` AFTER the durable write (like `restore`), so a second device's
// History refetches. Throws `CharacterNotFoundError` when not owned/found.

import type { CharacterContext } from "../context.ts";
import { CharacterNotFoundError } from "../contract/errors.ts";
import type { SnapshotParams } from "../contract/params.ts";
import type { CharacterService } from "../contract/service.ts";
import { appendSnapshot } from "../persistence/card.ts";
import { cardOf, loadOwnedCharacterRow } from "../persistence/queries.ts";

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
    ctx.emitUserEvent(ownerId, { type: "charactersChanged", characterId });

    return { id, characterId, createdAt: at };
  };
}
