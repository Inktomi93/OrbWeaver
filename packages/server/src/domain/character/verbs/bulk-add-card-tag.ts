// verb: bulkAddCardTag — attach a tag (by NAME) to many owned characters. The tag work (resolve-or-create
// the tag + write the junction row) is the tag domain's job, injected as `ctx.attachCardTag` (boundaries
// are physics — character never imports tag). This verb only owner-SCOPES the
// targets (an unowned/missing character is skipped, never attached to) and counts how many were newly
// attached (the port returns `false` for an idempotent no-op). A blank tag name is a no-op. No
// `character.updated` emit (a tag is not card content) — but `charactersChanged` still fires, see below.
//
// A PARTIAL BULK IS STILL DURABLE, SO IT IS STILL ANNOUNCED. The per-character attaches are INDEPENDENT
// writes; under `Promise.all` the first rejection abandoned the whole verb before the audit/emit block, so
// the siblings that HAD committed were left with no `charactersChanged` — the client kept rendering cards
// whose tags had changed on disk until something else invalidated them. `allSettled` separates the two
// questions: what committed gets audited and announced, and the failure is then rethrown UNCHANGED so the
// caller still sees the real (typed) error from the tag port rather than a laundered success.

import type { CharacterContext } from "../context.ts";
import type { BulkAddCardTagParams } from "../contract/params.ts";
import type { CharacterService } from "../contract/service.ts";
import { loadOwnedCharacterRow } from "../persistence/queries.ts";

export function createBulkAddCardTag(ctx: CharacterContext): CharacterService["bulkAddCardTag"] {
  return async ({ principal, tagName, characterIds }: BulkAddCardTagParams) => {
    const ownerId = principal.userId;
    const name = tagName.trim();
    if (name === "") {
      return;
    }

    const attached = await Promise.allSettled(
      characterIds.map(async (characterId) => {
        const row = await loadOwnedCharacterRow(ctx.db, ownerId, characterId);
        if (row === undefined) {
          return false;
        }
        return ctx.attachCardTag({ ownerId, characterId, tagName: name });
      }),
    );

    const updated = attached.filter((result) => result.status === "fulfilled" && result.value).length;
    if (updated > 0) {
      await ctx.audit(
        {
          actorUserId: ownerId,
          action: "character.bulk_add_card_tag",
          entityType: "character",
          metadata: { tag: name, updated },
        },
        ctx.now(),
      );
      ctx.emitUserEvent(ownerId, { type: "charactersChanged" });
    }
    const failed = attached.find((result) => result.status === "rejected");
    if (failed !== undefined) {
      throw failed.reason;
    }
  };
}
