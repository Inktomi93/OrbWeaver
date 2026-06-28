// verb: attachCardTagByName — the internal resolve-or-create-by-name card-tag attach character injects as its
// `AttachCardTagOp` (character.bulkAddCardTag). Two steps, both race-safe + idempotent:
//   1. RESOLVE-OR-CREATE the owner's tag by NAME — try-insert (no-op on the `(ownerId, name)` unique), then
//      fall back to the existing row. The unique index is the race guard: a concurrent create loses the INSERT
//      (empty RETURNING) and re-reads the winner — never a duplicate tag (tag.md invariant #1).
//   2. ATTACH it to the character (status `accepted` — a manual add is a live tag, not a staged suggestion),
//      reporting whether it was NEWLY attached (the boolean character.bulkAddCardTag counts as updated-vs-skipped).
// NOT principal-gated: `ownerId` is the caller-resolved owner (character has ALREADY owner-verified the row) —
// the trusted-system, owner-already-gated posture (the only caller is the composition-root-wired port). A blank
// name is a no-op (returns false) — the boundary guard against minting an empty-named tag if ever wired elsewhere.

import { DomainOperationError } from "@orb/kit/errors";
import type { AttachCardTagByNameParams } from "../contract/params";
import type { TagContext, TagService } from "../contract/service";
import { attachCharacterTagAccepted } from "../persistence/junctions";
import { findTagIdByName, insertTagIfAbsent } from "../persistence/queries";

export function createAttachCardTagByName(ctx: TagContext): TagService["attachCardTagByName"] {
  return async ({ ownerId, characterId, tagName }: AttachCardTagByNameParams): Promise<boolean> => {
    const name = tagName.trim();
    if (name === "") {
      return false;
    }
    const created = await insertTagIfAbsent(ctx.db, ownerId, name, ctx.newTagId());
    const tagId = created ?? (await findTagIdByName(ctx.db, ownerId, name));
    if (tagId === undefined) {
      // Unreachable: the INSERT conflicted on `(ownerId, name)`, so an owned row with that name exists.
      throw new DomainOperationError(
        "tag_resolve_failed",
        `resolve-or-create tag "${name}" found no row after a unique conflict`,
      );
    }
    return attachCharacterTagAccepted({ db: ctx.db, characterId, tagId });
  };
}
