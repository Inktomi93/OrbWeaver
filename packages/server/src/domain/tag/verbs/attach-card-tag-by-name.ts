// The internal resolve-or-create-by-name card-tag attach. The one home for every by-name attach: character's
// bulk add, import's card-tag carry, and the seeded default cards all route here. The name is normalized
// then resolved case-insensitively, so name variants collapse onto one tag row. Two race-safe, idempotent
// steps: resolve-or-create the owner's tag by name (try-insert, fall back to the existing row on conflict),
// then attach it at `status` (never downgrades an already-accepted row). Not principal-gated — `ownerId` is
// the caller-resolved owner; the caller has already owner-verified the row. A blank name is a no-op.

import { DomainOperationError } from "@orb/kit/errors";
import { normalizeTagName } from "@orb/kit/tag";
import type { AttachCardTagByNameParams } from "../contract/params.ts";
import type { TagContext, TagService } from "../contract/service.ts";
import { attachCharacterTag } from "../persistence/junctions.ts";
import { findTagIdByName, insertTagIfAbsent } from "../persistence/queries.ts";

export function createAttachCardTagByName(ctx: TagContext): TagService["attachCardTagByName"] {
  return async ({ ownerId, characterId, tagName, source = "manual", status = "accepted" }: AttachCardTagByNameParams): Promise<boolean> => {
    const name = normalizeTagName(tagName);
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
      // Unreachable: the INSERT conflicted, so an owned row that folds to this name exists and the
      // lookup re-reads it.
      throw new DomainOperationError("tag_resolve_failed", `resolve-or-create tag "${name}" found no row after a unique conflict`);
    }
    const newlyAttached = await attachCharacterTag({ db: ctx.db, characterId, tagId, status });
    // Best-effort audit only on a new attach — a re-import/re-add no-op writes no row, so a bulk re-import
    // doesn't spam the log.
    if (newlyAttached) {
      await ctx.audit({
        actorUserId: ownerId,
        action: "tag.attachByName",
        entityType: "tag",
        entityId: tagId,
        metadata: { characterId, name, source, status },
      });
    }
    return newlyAttached;
  };
}
