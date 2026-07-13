// verb: bulkRemoveCardTag — detach a tag (by NAME) from many owned characters, the mirror of `bulkAddCardTag`
// (the editor tag-chip remove; the chip passes `[characterId]`). The tag work (resolve the tag by name + drop
// the junction row) is the tag domain's job, injected as `ctx.detachCardTag` (boundaries are physics —
// character never imports tag). This verb only owner-SCOPES the targets (an unowned/missing character is
// skipped, never touched) and counts how many rows were actually removed (the port returns `false` for an
// already-absent tag/junction — idempotent). A blank tag name is a no-op. Freshness mirrors the attach exactly:
// on any removal it fires `charactersChanged` (the user-bus event that drives `trpc.character.*` — the editor's
// card + its tag chips), NOT `tagsChanged` (the attach doesn't emit that either; a tag is not card content).

import type { CharacterContext } from "../context";
import type { BulkRemoveCardTagParams } from "../contract/params";
import type { CharacterService } from "../contract/service";
import { loadOwnedCharacterRow } from "../persistence/queries";

export function createBulkRemoveCardTag(
  ctx: CharacterContext,
): CharacterService["bulkRemoveCardTag"] {
  return async ({ principal, tagName, characterIds }: BulkRemoveCardTagParams) => {
    const ownerId = principal.userId;
    const name = tagName.trim();
    if (name === "") {
      return;
    }

    const removedFlags = await Promise.all(
      characterIds.map(async (characterId) => {
        const row = await loadOwnedCharacterRow(ctx.db, ownerId, characterId);
        if (row === undefined) {
          return false;
        }
        return ctx.detachCardTag({ ownerId, characterId, tagName: name });
      }),
    );

    const removed = removedFlags.filter(Boolean).length;
    if (removed > 0) {
      await ctx.audit(
        {
          actorUserId: ownerId,
          action: "character.bulk_remove_card_tag",
          entityType: "character",
          metadata: { tag: name, removed },
        },
        ctx.now(),
      );
      ctx.emitUserEvent(ownerId, { type: "charactersChanged" });
    }
  };
}
