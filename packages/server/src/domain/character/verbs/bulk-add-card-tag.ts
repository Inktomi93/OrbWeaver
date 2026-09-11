// verb: bulkAddCardTag — attach a tag (by NAME) to many owned characters. The tag work (resolve-or-create
// the tag + write the junction row) is the tag domain's job, injected as `ctx.attachCardTag` (boundaries
// are physics — character never imports tag). This verb only owner-SCOPES the
// targets (an unowned/missing character is skipped, never attached to) and counts how many were newly
// attached (the port returns `false` for an idempotent no-op). A blank tag name is a no-op. No
// `character.updated` emit (a tag is not card content) — but `charactersChanged` still fires, see below.
//
// A PARTIAL BULK IS STILL DURABLE, SO IT IS STILL ANNOUNCED AND STILL NAMED (#1694). The per-character
// attaches are INDEPENDENT writes; under a bare `Promise.all` the first rejection would abandon the whole
// verb before the audit/emit block, so the siblings that HAD committed would be left with no
// `charactersChanged` — the client would keep rendering cards whose tags had changed on disk until
// something else invalidated them. Each mapped promise therefore catches its OWN rejection and returns a
// `BulkTagOutcome` naming its id either way, so `Promise.all` here can never abandon a sibling (the
// `allSettled` precedent's safety property, kept — see `bulk-tag-result.ts`'s header for why outcomes carry
// their own id instead of an index zip). The verb used to rethrow the first rejection unchanged, which
// laundered a partial success into one opaque failure for the whole batch — the caller could not tell which
// characters had, in fact, kept the tag. It now RESOLVES with the honest per-item split
// (`buildBulkTagResult`, `contracts/character`'s `CharacterBulkTagResult`) instead.

import type { CharacterBulkTagResult } from "@orb/contracts/character";
import type { CharacterContext } from "../context.ts";
import type { BulkAddCardTagParams } from "../contract/params.ts";
import type { BulkTagOutcome } from "../contract/results.ts";
import type { CharacterService } from "../contract/service.ts";
import { loadOwnedCharacterRow } from "../persistence/queries.ts";
import { buildBulkTagResult } from "../substrate/bulk-tag-result.ts";

export function createBulkAddCardTag(ctx: CharacterContext): CharacterService["bulkAddCardTag"] {
  return async ({ principal, tagName, characterIds }: BulkAddCardTagParams): Promise<CharacterBulkTagResult> => {
    const ownerId = principal.userId;
    const name = tagName.trim();
    if (name === "") {
      return { applied: [], failed: [] };
    }

    const outcomes = await Promise.all(
      characterIds.map(async (characterId): Promise<BulkTagOutcome> => {
        // @orb-waive caught-failure-ownership(failed): the owner IS this per-item result —
        // `failed` rides `outcomes` into `buildBulkTagResult`, which classifies it onto the wire's
        // `CharacterBulkTagResult.failed[].error` (never swallowed; the client's `refusal` toast is the
        // surfaced state). End condition: this batch's `Promise.all` resolving.
        try {
          const row = await loadOwnedCharacterRow(ctx.db, ownerId, characterId);
          if (row === undefined) {
            return { characterId, applied: false };
          }
          const applied = await ctx.attachCardTag({ ownerId, characterId, tagName: name });
          return { characterId, applied };
        } catch (failed) {
          return { characterId, failed };
        }
      }),
    );
    const result = buildBulkTagResult(outcomes);

    if (result.applied.length > 0) {
      await ctx.audit(
        {
          actorUserId: ownerId,
          action: "character.bulk_add_card_tag",
          entityType: "character",
          metadata: { tag: name, updated: result.applied.length },
        },
        ctx.now(),
      );
      ctx.emitUserEvent(ownerId, { type: "charactersChanged" });
    }
    return result;
  };
}
