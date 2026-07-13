// verb: detachCardTagByName — resolve-by-name card-tag detach, mirror of attachCardTagByName. Resolves the
// owner's tag case-insensitively (no create), then deletes the (characterId, tagId) junction; the tag row
// itself is left intact. Not principal-gated: ownerId is caller-resolved, character has already owner-verified
// the row. No emit here — the character verb fires charactersChanged.

import { normalizeTagName } from "@orb/kit/tag";
import type { DetachCardTagByNameParams } from "../contract/params";
import type { TagContext, TagService } from "../contract/service";
import { detachCharacterTag } from "../persistence/junctions";
import { findTagIdByName } from "../persistence/queries";

export function createDetachCardTagByName(ctx: TagContext): TagService["detachCardTagByName"] {
  return async ({ ownerId, characterId, tagName }: DetachCardTagByNameParams): Promise<boolean> => {
    const name = normalizeTagName(tagName);
    if (name === "") {
      return false;
    }
    const tagId = await findTagIdByName(ctx.db, ownerId, name);
    if (tagId === undefined) {
      return false;
    }
    const removed = await detachCharacterTag({ db: ctx.db, characterId, tagId });
    if (removed) {
      await ctx.audit({
        actorUserId: ownerId,
        action: "tag.detachByName",
        entityType: "tag",
        entityId: tagId,
        metadata: { characterId, name },
      });
    }
    return removed;
  };
}
