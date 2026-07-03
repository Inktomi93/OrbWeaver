// verb: importCharacter — one ST character card → one canonical character (4c W3 card slice). The flow:
//   1. parse the bytes (PNG ccv3/chara chunk → JSON, or a bare V2/V3 JSON card) → canonical CharacterCard
//      (tolerant IN); unreadable bytes throw ImportCardError("card_unreadable").
//   2. hash the whole FILE bytes → importHash (provenance + the dedup oracle).
//   3. dedup: if the owner already has a character with this importHash, return it (created:false) — a
//      byte-identical re-import is safe + a no-op.
//   4. PNG cards: CAS-store the SAME bytes as the avatar asset (one blob, both roles) → avatarAssetId.
//   5. flatten + validate → CreateCharacterInput, then create via the injected op WITH the provenance stamp.
//   6. carry the card's author-shipped tags: attach each parsed tag to the new character as a card/pending
//      suggestion via the injected tag op (`card.tags` → `character_tags`
//      `status:'pending'`, NOT a JSON column; the user's "Accept" later flips them to accepted).
//
// Boundaries-are-physics: the create / lookup / asset-store / tag-attach are INJECTED ops (context.ts) wired
// at the composition root — import sideways-imports neither character, assets, nor tag, and never reads a db
// table (the dedup lookup is the injected character read). Determinism: no clock/id/random here (the file hash
// is content-derived; the id is minted by the injected create op; the tag id by the injected tag op).

import { isPng } from "@orb/kit/png-card-chunk";
import { ImportCardError } from "../contract/errors";
import type { ImportCharacterInput } from "../contract/params";
import type { ImportCharacterResult } from "../contract/results";
import type { ImportContext, ImportService } from "../contract/service";
import { cardToCreateInput, importFileHash, parseCardJson, parseCardPng } from "../substrate/card";

// A PNG card IS its own avatar (ST embeds the card JSON in the avatar PNG). A bare-JSON card carries no
// image, so no avatar is stored.
const PNG_MIME = "image/png";
const DEFAULT_FALLBACK_NAME = "Imported Character";
const PATH_SEPARATOR = /[/\\]/;
const FILE_EXTENSION = /\.[^.]+$/;

/** Derive the fallback character name from the source filename (`"Aria.png"` → `"Aria"`) when the card
 *  JSON carries no name. Strips the directory + the final extension; empty → a stable default. */
function fallbackNameFrom(filename: string | undefined): string {
  if (filename === undefined) {
    return DEFAULT_FALLBACK_NAME;
  }
  const base = filename.split(PATH_SEPARATOR).pop() ?? filename;
  const stem = base.replace(FILE_EXTENSION, "").trim();
  return stem.length > 0 ? stem : DEFAULT_FALLBACK_NAME;
}

export function createImportCharacter(ctx: ImportContext): ImportService["importCharacter"] {
  return async ({ card }: ImportCharacterInput): Promise<ImportCharacterResult> => {
    const { bytes, filename } = card;
    const png = isPng(bytes);
    const fallbackName = fallbackNameFrom(filename);

    const parsed = png ? parseCardPng(bytes, fallbackName) : parseCardJson(bytes, fallbackName);
    if (parsed === null) {
      throw new ImportCardError(
        "card_unreadable",
        png
          ? "PNG carries no readable ccv3/chara character-card chunk"
          : "bytes are not a readable V2/V3 character-card JSON",
      );
    }
    const { card: characterCard, tags } = parsed;

    const importHash = importFileHash(bytes);

    // Re-import dedup: a byte-identical card already imported by this owner is a no-op (the tags were
    // attached on the first import; the attach is idempotent regardless, so nothing to redo here).
    const existing = await ctx.findByImportHash({ ownerId: ctx.ownerId, importHash });
    if (existing !== null) {
      return { characterId: existing, created: false, importHash };
    }

    // The card PNG is the avatar (one blob, both roles); a bare-JSON card has no image.
    const avatarAssetId = png
      ? await ctx.storeAsset({ ownerId: ctx.ownerId, bytes, mime: PNG_MIME })
      : null;

    const input = cardToCreateInput(characterCard, avatarAssetId);
    const ref = await ctx.createCharacter({
      ownerId: ctx.ownerId,
      input,
      importedFrom: filename ?? null,
      importHash,
    });

    // Carry the author-shipped tags as card/pending suggestions (the injected op binds source/status).
    for (const tagName of tags) {
      // biome-ignore lint/performance/noAwaitInLoops: card tags attach sequentially — each is an independent idempotent resolve-or-create-and-attach; card tag lists are short.
      await ctx.attachCardTag({ ownerId: ctx.ownerId, characterId: ref.characterId, tagName });
    }

    return { characterId: ref.characterId, created: true, importHash };
  };
}
