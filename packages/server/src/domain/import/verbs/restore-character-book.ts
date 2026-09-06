// verb: restoreCharacterBook — THE RESTORE DOOR (#1598, owner ruling 2026-09-05). Re-asserts a card file's
// EMBEDDED lorebook over the character those exact bytes imported as, replacing that character's primary
// book wholesale.
//
// WHY IT EXISTS AS ITS OWN VERB: re-uploading a card is no longer allowed to revert the owner's edits to the
// book it carried (`import-character.ts` skips the embedded-book plane when the primary seat is taken), so
// the destructive semantic world-info's `bulkImportLorebook` still implements needs an EXPLICIT door — one
// the owner asks for, rather than one a routine re-upload walks into. "The card file is the source of truth"
// is a real intent; it is just not the default.
//
// THE CARD NAMES ITS OWN TARGET. There is no caller-supplied characterId: the bytes are hashed with the same
// `importFileHash` the import dedup uses and resolved through the caller's own `(ownerId, importHash)`
// oracle, so a restore can only land on a character THIS owner imported from THESE bytes. Nothing to mis-aim,
// and the world-info write re-asserts ownership before it touches a row.
//
// It never throws for a bad file (the `importChatFile` contract): an unreadable card, a card carrying no
// embedded book, a card this owner never imported, and a composition with no world-info write op are all
// operator-facing refusals the calling door renders.

import { isPng } from "@orb/kit/png-card-chunk";
import type { ImportContext } from "../context.ts";
import type { RestoreCharacterBookInput } from "../contract/params.ts";
import type { RestoreCharacterBookResult } from "../contract/results.ts";
import type { ImportService } from "../contract/service.ts";
import { importFileHash, parseCardJson, parseCardPng } from "../substrate/card.ts";

const FALLBACK_NAME = "Imported Character";

export function createRestoreCharacterBook(ctx: ImportContext): Pick<ImportService, "restoreCharacterBook"> {
  async function restoreCharacterBook({ card }: RestoreCharacterBookInput): Promise<RestoreCharacterBookResult> {
    const { bytes } = card;
    // The name fallback is irrelevant here (no character is minted) — only the carried book is read — so the
    // parse takes the constant rather than deriving a name this verb would never use.
    const parsed = isPng(bytes) ? await parseCardPng(bytes, FALLBACK_NAME) : parseCardJson(bytes, FALLBACK_NAME);
    if (parsed === null) {
      return { ok: false, error: "This file isn't a readable V2/V3 character card, so it carries no world book to restore" };
    }
    if (parsed.book === null) {
      return { ok: false, error: "This character card carries no embedded world book — there is nothing to restore from it" };
    }
    if (ctx.importLorebook === undefined) {
      return { ok: false, error: "World book writes are not wired into this import composition" };
    }
    const characterId = await ctx.findByImportHash({ ownerId: ctx.ownerId, importHash: importFileHash(bytes) });
    if (characterId === null) {
      return { ok: false, error: "No character of yours was imported from this exact card file, so there is no book to restore onto" };
    }
    const result = await ctx.importLorebook({ ownerId: ctx.ownerId, characterId, book: parsed.book });
    return { ok: true, characterId, worldBookId: result.worldBookId, entryCount: result.entryCount, replaced: result.replaced };
  }
  return { restoreCharacterBook };
}
