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

import type { CharacterHandle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { cardContentHash } from "#kit/serde/card";
import type { CharacterContext } from "../context";
import { CharacterNotFoundError } from "../contract/errors";
import type { DuplicateCharacterParams } from "../contract/params";
import type { CharacterService } from "../contract/service";
import { insertCharacter } from "../persistence/card";
import { canonicalTagsOf, cardOf, detailOf, listOwnerHandles, loadOwnedCharacterRow, loadOwnedCharacterWithAvatar } from "../persistence/queries";
import { cardTokenSize } from "../substrate/card-tokens";

const COPY_SUFFIX = "-copy";
const FIRST_INCREMENT = 2;

/** First free `<handle>-copy[-n]` not already used by the owner. */
function freeCopyHandle(sourceHandle: CharacterHandle, taken: ReadonlySet<string>): CharacterHandle {
  const base = castId<CharacterHandle>(`${sourceHandle}${COPY_SUFFIX}`);
  if (!taken.has(base)) {
    return base;
  }
  let n = FIRST_INCREMENT;
  while (taken.has(`${base}-${n}`)) {
    n += 1;
  }
  return castId<CharacterHandle>(`${base}-${n}`);
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

    await insertCharacter(ctx.db, {
      id: newId,
      handle,
      ownerId,
      contentHash: cardContentHash(card),
      tokenSize: cardTokenSize(card),
      forbidExternalMedia: source.forbidExternalMedia,
      trustHtml: source.trustHtml,
      themeOverride: source.themeOverride,
      backgroundOverride: source.backgroundOverride,
      createdAt: at,
      ...card,
    });

    // PD-141: carry the source's attached world-info book REFERENCES onto the duplicate (fresh
    // character_books rows pointing at the SAME books; world-info owns the junction write, D28). Sequential
    // after the insert (the FK needs the new row); no transaction — matches duplicate's existing op story.
    await ctx.copyCharacterBooks({ ownerId, fromCharacterId: characterId, toCharacterId: newId });

    // A duplicate is a fresh card with copied content → embed it (contentChanged always true for duplicate).
    ctx.emit({ type: "character.updated", characterId: newId, contentChanged: true });
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
    ctx.emitUserEvent(ownerId, { type: "charactersChanged", characterId: newId });

    const row = await loadOwnedCharacterWithAvatar(ctx.db, ownerId, newId);
    if (row === undefined) {
      throw new CharacterNotFoundError(newId);
    }
    return detailOf(row, await canonicalTagsOf(ctx.db, newId));
  };
}
