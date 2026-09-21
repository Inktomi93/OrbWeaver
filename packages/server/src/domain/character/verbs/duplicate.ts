// verb: duplicate — clone an owned character into a FRESH local card. The card content is copied verbatim;
// the handle gets a free `<handle>-copy[-n]` (per-owner unique); identity flags reset (not starred/archived)
// and import provenance is CLEARED (`importedFrom`/`importHash` null — the clone is app-authored, not
// imported), but the per-character render/theme policies (`forbidExternalMedia`, `trustHtml`,
// `themeOverride`) carry forward.
// `contentHash` is the
// flatten of the copied card. The source's attached world-info book REFERENCES are CARRIED onto the clone
// (PD-141) via the injected `copyCharacterBooks` op — fresh junction rows at the SAME books; the books are
// standalone entities and are NEVER cloned. Emits `character.updated`. Throws `CharacterNotFoundError` when
// the source isn't owned/found.

import { deriveCharacterHandle } from "@orb/contracts/character";
import type { CharacterHandle, CharacterId, UserId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import { cardContentHash } from "#kit/serde/card";
import type { CharacterContext } from "../context.ts";
import { CharacterNotFoundError } from "../contract/errors.ts";
import type { DuplicateCharacterParams } from "../contract/params.ts";
import type { CharacterService } from "../contract/service.ts";
import { deleteOwnedCharacter, insertCharacter } from "../persistence/card.ts";
import { canonicalTagsOf, cardOf, detailOf, listOwnerHandles, loadOwnedCharacterRow, loadOwnedCharacterWithAvatar } from "../persistence/queries.ts";
import { cardTokenSize } from "../substrate/card-tokens.ts";

const COPY_SUFFIX = "-copy";
const FIRST_INCREMENT = 2;

/** First free `<handle>-copy[-n]` not already used by the owner. */
function freeCopyHandle(sourceHandle: CharacterHandle, taken: ReadonlySet<string>): CharacterHandle {
  const base = deriveCharacterHandle(sourceHandle, COPY_SUFFIX);
  if (!taken.has(base)) {
    return base;
  }
  let n = FIRST_INCREMENT;
  let candidate = deriveCharacterHandle(sourceHandle, `${COPY_SUFFIX}-${n}`);
  while (taken.has(candidate)) {
    n += 1;
    candidate = deriveCharacterHandle(sourceHandle, `${COPY_SUFFIX}-${n}`);
  }
  return candidate;
}

/** Undo a clone whose book copy failed. Best-effort by construction: the caller rethrows the ORIGINAL
 *  failure either way, so a cleanup that cannot run is logged with the cause it was compensating for and
 *  nothing else changes. */
async function deleteClone(ctx: CharacterContext, args: { readonly ownerId: UserId; readonly cloneId: CharacterId; readonly cause: unknown }): Promise<void> {
  try {
    await deleteOwnedCharacter(ctx.db, args.cloneId, args.ownerId, ctx.bumpStatsCanonVersion);
  } catch (cleanupErr) {
    getLog().error(
      { err: cleanupErr, cause: args.cause, characterId: args.cloneId },
      "character: duplicate rollback failed — the clone row survives its failed book copy (orphan heals on the next delete/GC)",
    );
  }
}

export function createDuplicate(ctx: CharacterContext): CharacterService["duplicate"] {
  return async ({ principal, characterId }: DuplicateCharacterParams) => {
    const ownerId = principal.userId;
    const source = await loadOwnedCharacterRow(ctx.db, ownerId, characterId);
    if (source === undefined) {
      throw new CharacterNotFoundError(characterId);
    }

    const taken = new Set(await listOwnerHandles(ctx.db, ownerId));
    const handle = freeCopyHandle(source.handle, taken);
    const card = cardOf(source);
    const newId = ctx.newCharacterId();
    const at = ctx.now();

    await insertCharacter(
      ctx.db,
      {
        id: newId,
        handle,
        ownerId,
        contentHash: cardContentHash(card),
        tokenSize: cardTokenSize(card),
        forbidExternalMedia: source.forbidExternalMedia,
        trustHtml: source.trustHtml,
        interactiveHtml: source.interactiveHtml,
        themeOverride: source.themeOverride,
        backgroundOverride: source.backgroundOverride,
        createdAt: at,
        ...card,
      },
      ctx.bumpStatsCanonVersion,
    );

    // PD-141: carry the source's attached world-info book REFERENCES onto the duplicate (fresh
    // character_books rows pointing at the SAME books; world-info owns the junction write, D28). Sequential
    // after the insert (the FK needs the new row).
    //
    // A CLONE WITHOUT ITS BOOKS IS NOT HALF A CLONE, IT IS A WRONG ONE — AND IT POISONS THE RETRY. The book
    // copy is another DOMAIN's write (world-info owns that junction), so `db.batch` cannot span it and the
    // clone's insert has already committed by the time it can fail. Left alone, the caller saw a rejection
    // while a bookless `<handle>-copy` sat in the library, and the obvious retry read that row as a taken
    // handle and minted `-copy-2`: every attempt accumulated one more orphan. So the failure COMPENSATES —
    // the clone row is deleted and the ORIGINAL error is rethrown, which puts the library back exactly where
    // the retry expects it. A compensating delete that itself fails is logged and the original error still
    // wins (the caller must not learn about the cleanup instead of the cause); the leftover row is then the
    // same orphan the un-compensated path always left, never worse.
    try {
      await ctx.copyCharacterBooks({ ownerId, fromCharacterId: characterId, toCharacterId: newId });
    } catch (err) {
      await deleteClone(ctx, { ownerId, cloneId: newId, cause: err });
      throw err;
    }

    // NOTHING IS ANNOUNCED UNTIL BOTH HALVES AND THE AUDIT HAVE LANDED. `emit` fired before the audit here
    // too (the `create` defect): a rejected audit left the indexer embedding a clone the caller was told had
    // failed.
    await ctx.audit(
      {
        actorUserId: ownerId,
        action: "character.duplicate",
        entityType: "character",
        entityId: newId,
        metadata: { from: characterId, handle },
      },
      at,
    );
    // A duplicate is a fresh card with copied content → embed it (contentChanged always true for duplicate).
    ctx.emit({ type: "character.updated", characterId: newId, contentChanged: true });
    ctx.emitUserEvent(ownerId, { type: "charactersChanged", characterId: newId });

    const row = await loadOwnedCharacterWithAvatar(ctx.db, ownerId, newId);
    if (row === undefined) {
      throw new CharacterNotFoundError(newId);
    }
    return detailOf(row, await canonicalTagsOf(ctx.db, newId));
  };
}
