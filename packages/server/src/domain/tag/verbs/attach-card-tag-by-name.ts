// verb: attachCardTagByName — the internal resolve-or-create-by-name card-tag attach. The ONE home for every
// by-name attach: character's `AttachCardTagOp` (bulkAddCardTag), import's card-tag carry, and the seeded
// default cards all route here (no parallel tag-attach flow). Two steps, both race-safe + idempotent:
//   1. RESOLVE-OR-CREATE the owner's tag by NAME — try-insert (no-op on the `(ownerId, name)` unique), then
//      fall back to the existing row. The unique index is the race guard: a concurrent create loses the INSERT
//      (empty RETURNING) and re-reads the winner — never a duplicate tag (tag.md invariant #1). `source` is
//      stamped ONLY on first create (a tag's source is set once); an existing tag keeps its source.
//   2. ATTACH it to the character at `status`, reporting whether it was NEWLY attached (the boolean
//      character.bulkAddCardTag counts as updated-vs-skipped). The attach is `onConflictDoNothing` → a
//      re-attach NEVER downgrades an already-`accepted` row to `pending` (a card re-import can't un-accept).
// Defaults `source:'manual', status:'accepted'` so a user manual-add stays manual/accepted (the unchanged
// character caller); import / a seeded card pass `source:'card', status:'pending'` (a staged suggestion).
// NOT principal-gated: `ownerId` is the caller-resolved owner (character has ALREADY owner-verified the row) —
// the trusted-system, owner-already-gated posture (the callers are composition-root-wired ports). A blank
// name is a no-op (returns false) — the boundary guard against minting an empty-named tag.

import { DomainOperationError } from "@orb/kit/errors";
import type { AttachCardTagByNameParams } from "../contract/params";
import type { TagContext, TagService } from "../contract/service";
import { attachCharacterTag } from "../persistence/junctions";
import { findTagIdByName, insertTagIfAbsent } from "../persistence/queries";

export function createAttachCardTagByName(ctx: TagContext): TagService["attachCardTagByName"] {
  return async ({
    ownerId,
    characterId,
    tagName,
    source = "manual",
    status = "accepted",
  }: AttachCardTagByNameParams): Promise<boolean> => {
    const name = tagName.trim();
    if (name === "") {
      return false;
    }
    const created = await insertTagIfAbsent({
      db: ctx.db,
      ownerId,
      name,
      tagId: ctx.newTagId(),
      source,
    });
    const tagId = created ?? (await findTagIdByName(ctx.db, ownerId, name));
    if (tagId === undefined) {
      // Unreachable: the INSERT conflicted on `(ownerId, name)`, so an owned row with that name exists.
      throw new DomainOperationError(
        "tag_resolve_failed",
        `resolve-or-create tag "${name}" found no row after a unique conflict`,
      );
    }
    return attachCharacterTag({ db: ctx.db, characterId, tagId, status });
  };
}
