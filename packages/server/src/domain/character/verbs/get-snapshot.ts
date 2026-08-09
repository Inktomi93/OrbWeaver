// verb: getSnapshot — one snapshot WITH its opaque card blob (the refinery Versions walk's compare read,
// schema-renderer §16.2: the LIST stays trimmed, content is fetched per selected snapshot). Owner-gated
// through the character (the belt runs BEFORE the snapshot lookup); a foreign/absent character OR a
// snapshot outside it collapses to the same NOT_FOUND (leak-free). A read: no audit, no emit. The blob
// rides AS WRITTEN (the D28 opaque-history posture — it describes the card as it stood, never
// re-validated against today's schema).

import type { CharacterContext } from "../context.ts";
import { CharacterNotFoundError } from "../contract/errors.ts";
import type { GetSnapshotParams } from "../contract/params.ts";
import type { CharacterService } from "../contract/service.ts";
import { loadOwnedCharacterRow, loadSnapshotRow } from "../persistence/queries.ts";

export function createGetSnapshot(ctx: CharacterContext): CharacterService["getSnapshot"] {
  return async ({ principal, characterId, snapshotId }: GetSnapshotParams) => {
    const row = await loadOwnedCharacterRow(ctx.db, principal.userId, characterId);
    if (row === undefined) {
      throw new CharacterNotFoundError(characterId);
    }
    const snapshot = await loadSnapshotRow(ctx.db, characterId, snapshotId);
    if (snapshot === undefined) {
      throw new CharacterNotFoundError(characterId);
    }
    return { id: snapshot.id, label: snapshot.label, createdAt: snapshot.createdAt, content: snapshot.content };
  };
}
