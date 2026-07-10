// verb: detachCardTagByName — the internal resolve-BY-NAME card-tag detach (character's injected
// `DetachCardTagOp`), the mirror of `attachCardTagByName`. The ONE home for by-name card-tag removal: the
// editor's tag-chip remove routes here (via character's `bulkRemoveCardTag`). Two steps, both idempotent:
//   1. RESOLVE the owner's tag by NAME — case-INsensitively (`normalizeTagName` FIRST, then a `lower(name)`
//      match), NO create (a detach never mints a tag). A missing tag ⇒ nothing to remove → `false`.
//   2. DELETE the `(characterId, tagId)` junction row, reporting whether one existed (the boolean
//      `character.bulkRemoveCardTag` counts as removed-vs-skipped). The tag row itself is left intact — an
//      orphaned tag with zero junctions is the prune-unused concern, not a detach's.
// NOT principal-gated: `ownerId` is the caller-resolved owner (character has ALREADY owner-verified the row) —
// the same trusted-system, owner-already-gated posture as `attachCardTagByName`. A blank name is a no-op
// (returns false). No emit here — the CHARACTER verb fires `charactersChanged` (mirrors the attach path, where
// the emit also lives in `bulkAddCardTag`, never in the port).

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
      // The owner has no tag folding to this name — nothing to detach (idempotent on absent).
      return false;
    }
    const removed = await detachCharacterTag({ db: ctx.db, characterId, tagId });
    // Best-effort audit only on an ACTUAL removal — detaching an already-absent junction writes no row, so a
    // repeated remove doesn't spam the log (mirrors the attach path's new-attach-only audit). Actor = the
    // caller-resolved owner (trusted/owner-already-gated by its composition-root caller — file header).
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
