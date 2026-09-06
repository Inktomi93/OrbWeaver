// verb: bulkRemoveCardTag — detach a tag (by NAME) from many owned characters, the mirror of `bulkAddCardTag`
// (the editor tag-chip remove; the chip passes `[characterId]`). The tag work (resolve the tag by name + drop
// the junction row) is the tag domain's job, injected as `ctx.detachCardTag` (boundaries are physics —
// character never imports tag). This verb only owner-SCOPES the targets (an unowned/missing character is
// skipped, never touched) and counts how many rows were actually removed (the port returns `false` for an
// already-absent tag/junction — idempotent). A blank tag name is a no-op. Freshness mirrors the attach exactly:
// on any removal it fires `charactersChanged` (the user-bus event that drives `trpc.character.*` — the editor's
// card + its tag chips), NOT `tagsChanged` (the attach doesn't emit that either; a tag is not card content).
// The partial-failure posture mirrors the attach exactly (#1694): each mapped promise catches its OWN
// rejection into a named `BulkTagOutcome` so `Promise.all` here can never abandon a sibling, announce what
// committed, and RESOLVE with the honest per-item split (`buildBulkTagResult`) instead of rethrowing the
// first rejection (see `bulkAddCardTag`'s header for the full mechanism, and why a rethrow launders a
// partial success into one opaque failure).

import type { CharacterBulkTagResult } from "@orb/contracts/character";
import type { CharacterContext } from "../context.ts";
import type { BulkRemoveCardTagParams } from "../contract/params.ts";
import type { BulkTagOutcome } from "../contract/results.ts";
import type { CharacterService } from "../contract/service.ts";
import { loadOwnedCharacterRow } from "../persistence/queries.ts";
import { buildBulkTagResult } from "../substrate/bulk-tag-result.ts";

export function createBulkRemoveCardTag(ctx: CharacterContext): CharacterService["bulkRemoveCardTag"] {
  return async ({ principal, tagName, characterIds }: BulkRemoveCardTagParams): Promise<CharacterBulkTagResult> => {
    const ownerId = principal.userId;
    const name = tagName.trim();
    if (name === "") {
      return { applied: [], failed: [] };
    }

    const outcomes = await Promise.all(
      characterIds.map(async (characterId): Promise<BulkTagOutcome> => {
        // @orb-gate-ignore caught-failure-ownership(empty:failed): the owner IS this per-item result —
        // `failed` rides `outcomes` into `buildBulkTagResult`, which classifies it onto the wire's
        // `CharacterBulkTagResult.failed[].error` (never swallowed; the client's `refusal` toast is the
        // surfaced state). End condition: this batch's `Promise.all` resolving.
        try {
          const row = await loadOwnedCharacterRow(ctx.db, ownerId, characterId);
          if (row === undefined) {
            return { characterId, applied: false };
          }
          const applied = await ctx.detachCardTag({ ownerId, characterId, tagName: name });
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
          action: "character.bulk_remove_card_tag",
          entityType: "character",
          metadata: { tag: name, removed: result.applied.length },
        },
        ctx.now(),
      );
      ctx.emitUserEvent(ownerId, { type: "charactersChanged" });
    }
    return result;
  };
}
