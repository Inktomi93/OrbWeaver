// verb: bulkAddCardTag — attach a tag (by NAME) to many owned characters. The tag work (resolve-or-create
// the tag + write the junction row) is the tag domain's job, injected as `ctx.attachCardTag` (boundaries
// are physics — character never imports tag; character.md §"tag junction"). This verb only owner-SCOPES the
// targets (an unowned/missing character is skipped, never attached to) and counts how many were newly
// attached (the port returns `false` for an idempotent no-op). A blank tag name is a no-op. No emit (a tag
// is not card content).

import type { BulkAddCardTagParams } from "../contract/params";
import type { CharacterContext, CharacterService } from "../contract/service";
import { loadOwnedCharacterRow } from "../persistence/queries";

export function createBulkAddCardTag(ctx: CharacterContext): CharacterService["bulkAddCardTag"] {
  return async ({ principal, tagName, characterIds }: BulkAddCardTagParams) => {
    const ownerId = principal.userId;
    const name = tagName.trim();
    if (name === "") {
      return { updated: 0, missing: 0, skipped: characterIds.length };
    }

    const results = await Promise.allSettled(
      characterIds.map(async (characterId) => {
        const row = await loadOwnedCharacterRow(ctx.db, ownerId, characterId);
        if (row === undefined) {
          return { status: "missing" as const };
        }
        const attached = await ctx.attachCardTag({ ownerId, characterId, tagName: name });
        if (!attached) {
          return { status: "skipped" as const };
        }
        return { status: "updated" as const };
      }),
    );

    let updated = 0;
    let missing = 0;
    let skipped = 0;

    for (const res of results) {
      if (res.status === "rejected") {
        throw res.reason;
      }
      if (res.value.status === "missing") {
        missing++;
      } else if (res.value.status === "skipped") {
        skipped++;
      } else {
        updated++;
      }
    }

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
    }

    return { updated, missing, skipped };
  };
}
