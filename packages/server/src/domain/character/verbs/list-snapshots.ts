// verb: listSnapshots — browse an owned character's snapshot history, newest first (the opaque blob is read
// only on restore). Owner-gated. A read: no audit, no emit. Throws `CharacterNotFoundError` when not
// owned/found.

import type { CharacterContext } from "../context.ts";
import { CharacterNotFoundError } from "../contract/errors.ts";
import type { ListSnapshotsParams } from "../contract/params.ts";
import type { CharacterService } from "../contract/service.ts";
import { listSnapshotSummaries, loadOwnedCharacterRow } from "../persistence/queries.ts";

export function createListSnapshots(ctx: CharacterContext): CharacterService["listSnapshots"] {
  return async ({ principal, characterId }: ListSnapshotsParams) => {
    const row = await loadOwnedCharacterRow(ctx.db, principal.userId, characterId);
    if (row === undefined) {
      throw new CharacterNotFoundError(characterId);
    }
    return listSnapshotSummaries(ctx.db, characterId);
  };
}
