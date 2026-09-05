// verb: getSnapshot — one snapshot WITH its opaque card blob (the refinery Versions walk's compare read,
// schema-renderer §16.2: the LIST stays trimmed, content is fetched per selected snapshot). Owner-gated
// through the character (the belt runs BEFORE the snapshot lookup); a foreign/absent character OR a
// snapshot outside it collapses to the same NOT_FOUND (leak-free). A read: no audit, no emit.
//
// THE HISTORY STAYS OPAQUE AT REST; THE READ IS A PROJECTION. This verb's header used to say "the blob
// rides AS WRITTEN … never re-validated against today's schema", and the AT-REST half of that ruling is
// untouched: nothing here rewrites, heals or migrates a stored `character_snapshots` row — the bytes on
// disk still describe the card as it stood. What changed is the ruling's INPUT. `restore` reads the SAME
// blob through `loadSnapshotContent` → `cardOf`, so a raw read made the compare view show a shape the
// restore would never produce; and `SnapshotView.content` is typed `CharacterCard`, a claim the raw column
// cannot honour for a row written under an older shape (the JSON sub-columns — greetings, depthPrompt,
// extensions, residualData, refinery — are exactly what `cardOf`'s parse seams heal). So the read routes
// through the one projection seam every other card read in this domain uses, and the compare view now
// shows what restoring would actually give you.

import type { CharacterContext } from "../context.ts";
import { CharacterNotFoundError } from "../contract/errors.ts";
import type { GetSnapshotParams } from "../contract/params.ts";
import type { CharacterService } from "../contract/service.ts";
import { cardOf, loadOwnedCharacterRow, loadSnapshotRow } from "../persistence/queries.ts";

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
    return { id: snapshot.id, label: snapshot.label, createdAt: snapshot.createdAt, content: cardOf(snapshot.content) };
  };
}
